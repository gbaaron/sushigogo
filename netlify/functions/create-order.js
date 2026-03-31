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
        const body = JSON.parse(event.body);
        const { items, pickupTime, subtotal, tax, total, pointsEarned, paymentMethod, pointsRedeemed } = body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'No items in order' }) };
        }

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
                const remaining = currentPoints - (pointsRedeemed || 0);
                if (remaining < 0) {
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
            PickupTime: pickupTime || '',
            ItemsList: items.map(item => `${item.name} (${item.quantity})`).join(', '),
            ItemsJSON: JSON.stringify(items),
            Subtotal: Number(subtotal) || 0,
            Tax: Number(tax) || 0,
            Total: Number(total) || 0,
            PointsEarned: Number(pointsEarned) || 0,
            Status: 'Pending'
        };

        if (!isGuest && userData) {
            orderFields.UserID = decoded.userId;
            orderFields.CustomerName = userData.get('Name') || '';
            orderFields.CustomerEmail = userData.get('Email') || '';
        }

        if (paymentMethod === 'points') {
            orderFields.PaymentMethod = 'points';
            orderFields.PointsRedeemed = Number(pointsRedeemed) || 0;
        } else {
            orderFields.PaymentMethod = 'money';
            orderFields.PointsRedeemed = 0;
        }

        // typecast: true lets Airtable auto-create single-select options and coerce field types
        const order = await base('Orders').create([{ fields: orderFields }], { typecast: true });

        // Points and tier logic — only for authenticated users
        if (!isGuest && userData) {
            let newPoints;

            if (paymentMethod === 'points') {
                newPoints = currentPoints - (pointsRedeemed || 0);
            } else {
                newPoints = currentPoints + (pointsEarned || 0);
            }

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
                    TotalSpent: currentSpent + (Number(total) || 0),
                    TierLevel: newTier
                }
            }], { typecast: true });

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
            body: JSON.stringify({
                error: 'Failed to create order',
                detail: error.message || String(error),
                statusCode: error.statusCode || null
            })
        };
    }
};
