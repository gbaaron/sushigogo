const Airtable = require('airtable');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'sushigogo-secret-key-change-in-production';

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const token = event.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'No authorization token' }) };
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Query orders by UserID plain text — avoids needing a linked record field
        const records = await base('Orders').select({
            filterByFormula: `{UserID} = '${decoded.userId}'`,
            sort: [{ field: 'OrderDate', direction: 'desc' }]
        }).all();

        if (records.length === 0) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ upcoming: [], past: [] })
            };
        }

        const upcoming = [];
        const past = [];

        records.forEach(record => {
            const orderData = {
                id: record.id,
                orderDate: record.get('OrderDate'),
                pickupTime: record.get('PickupTime'),
                items: record.get('ItemsList'),
                subtotal: record.get('Subtotal'),
                tax: record.get('Tax'),
                total: record.get('Total'),
                pointsEarned: record.get('PointsEarned'),
                status: record.get('Status')
            };

            if (['Pending', 'Preparing', 'Ready'].includes(orderData.status)) {
                upcoming.push(orderData);
            } else {
                past.push(orderData);
            }
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                upcoming,
                past: past.slice(0, 10)
            })
        };

    } catch (error) {
        console.error('Get orders error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to get orders' })
        };
    }
};
