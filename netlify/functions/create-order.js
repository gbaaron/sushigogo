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

        // Link to user if logged in
        if (!isGuest) {
            orderFields.UserID = [decoded.userId];
        }

        const order = await base('Orders').create([{ fields: orderFields }]);

        // Points and tier logic — only for authenticated users
        if (!isGuest) {
            const user = await base('Users').find(decoded.userId);
            const currentPoints = user.get('Points') || 0;
            const currentSpent = user.get('TotalSpent') || 0;

            let newPoints;

            if (paymentMethod === 'points') {
                // Points redemption — deduct points, earn nothing
                newPoints = currentPoints - (pointsRedeemed || 0);
                if (newPoints < 0) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ error: 'Insufficient points' })
                    };
                }
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
