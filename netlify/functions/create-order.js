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
        const token = event.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'No authorization token' }) };
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const { items, pickupTime, subtotal, tax, total, pointsEarned } = JSON.parse(event.body);

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        const order = await base('Orders').create([{
            fields: {
                UserID: [decoded.userId],
                OrderDate: new Date().toISOString(),
                PickupTime: pickupTime,
                ItemsList: items.map(item => `${item.name} (${item.quantity})`).join(', '),
                ItemsJSON: JSON.stringify(items),
                Subtotal: subtotal,
                Tax: tax,
                Total: total,
                PointsEarned: pointsEarned,
                Status: 'Pending'
            }
        }]);

        // Update user's points and total spent
        const user = await base('Users').find(decoded.userId);
        const currentPoints = user.get('Points') || 0;
        const currentSpent = user.get('TotalSpent') || 0;
        const newPoints = currentPoints + pointsEarned;

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
                TotalSpent: currentSpent + total,
                TierLevel: newTier
            }
        }]);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                orderId: order[0].id,
                pointsEarned,
                newPointsTotal: newPoints,
                newTier
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
