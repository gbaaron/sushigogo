const Airtable = require('airtable');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'sushigogo-secret-key-change-in-production';

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const { items, pickupTime, subtotal, tax, total, pointsEarned, paymentMethod, pointsRedeemed } = JSON.parse(event.body);
        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Check for auth token (optional for guest checkout)
        const token = event.headers.authorization?.replace('Bearer ', '');
        let decoded = null;
        let isGuest = true;

        if (token) {
            try {
                decoded = jwt.verify(token, JWT_SECRET);
                isGuest = false;
            } catch (e) {
                return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
            }
        }

        // Fetch user record up front (needed for name, email, and points)
        let userData = null;
        let currentPoints = 0;
        let currentSpent = 0;

        if (!isGuest) {
            userData = await base('Users').find(decoded.userId);
            currentPoints = userData.get('Points') || 0;
            currentSpent = userData.get('TotalSpent') || 0;

            // Validate sufficient points BEFORE creating the order
            if (paymentMethod === 'points') {
                const newPoints = currentPoints - (pointsRedeemed || 0);
                if (newPoints < 0) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ error: 'Insufficient points' })
                    };
                }
            }
        }

        // Build order fields
        const orderFields = {
            OrderDate: new Date().toISOString(),
            PickupTime: pickupTime,
            ItemsList: items.map(item => `${item.name} (${item.quantity})`).join(', '),
            ItemsJSON: JSON.stringify(items),
            Subtotal: subtotal || 0,
            Tax: tax || 0,
            Total: total || 0,
            PointsEarned: pointsEarned || 0,
            Status: 'Pending'
        };

        // Store user ID as plain text (not linked record array)
        if (!isGuest && userData) {
            orderFields.UserID = decoded.userId;
        }

        // Attempt to create the order. If CustomerName/CustomerEmail fields don't exist
        // in Airtable yet, fall back to creating without them (add those fields in Airtable
        // to enable customer names in the admin dashboard).
        let order;
        try {
            const fieldsWithCustomer = { ...orderFields };
            if (!isGuest && userData) {
                fieldsWithCustomer.CustomerName = userData.get('Name') || '';
                fieldsWithCustomer.CustomerEmail = userData.get('Email') || '';
            }
            order = await base('Orders').create([{ fields: fieldsWithCustomer }]);
        } catch (createErr) {
            // Retry without optional customer name fields (fields may not exist in Airtable yet)
            order = await base('Orders').create([{ fields: orderFields }]);
        }

        // Points and tier logic — only for authenticated users
        if (!isGuest && userData) {
            let newPoints;

            if (paymentMethod === 'points') {
                // Points redemption — deduct points, earn nothing
                newPoints = currentPoints - (pointsRedeemed || 0);
            } else {
                // Money payment — earn points
                newPoints = currentPoints + (pointsEarned || 0);
            }

            // Auto tier upgrade
            let newTier = 'Bronze';
            if (newPoints >= 1500) {
                newTier = 'Gold';
            } else if (newPoints >= 500) {
                newTier = 'Silver';
            }

            await base('Users').update([{
                id: decoded.userId,
                fields: {
                    Points: newPoints,
                    TotalSpent: currentSpent + (total || 0),
                    TierLevel: newTier
                }
            }]);

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    orderId: order[0].id,
                    pointsEarned: pointsEarned || 0,
                    pointsRedeemed: pointsRedeemed || 0,
                    newPointsTotal: newPoints,
                    newTier
                })
            };
        }

        // Guest response — no points info
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                orderId: order[0].id
            })
        };

    } catch (error) {
        console.error('Create order error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to create order' })
        };
    }
};
