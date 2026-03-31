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

        // Verify admin
        const user = await base('Users').find(decoded.userId);
        if (!user.get('IsAdmin')) {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin access required' }) };
        }

        const statusFilter = event.queryStringParameters?.status;

        const options = {
            sort: [{ field: 'OrderDate', direction: 'desc' }]
        };

        if (statusFilter && ['Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled'].includes(statusFilter)) {
            options.filterByFormula = `{Status} = '${statusFilter}'`;
        }

        const records = await base('Orders').select(options).all();

        const orders = records.map(record => {
            const userId = record.get('UserID') || '';
            const customerName = record.get('CustomerName') || 'Guest';
            const customerEmail = record.get('CustomerEmail') || '';

            return {
                id: record.id,
                orderDate: record.get('OrderDate'),
                pickupTime: record.get('PickupTime'),
                items: record.get('ItemsList'),
                subtotal: parseFloat(record.get('Subtotal')) || 0,
                tax: parseFloat(record.get('Tax')) || 0,
                total: parseFloat(record.get('Total')) || 0,
                pointsEarned: parseInt(record.get('PointsEarned')) || 0,
                status: record.get('Status') || 'Pending',
                customerName,
                customerEmail,
                isGuest: !userId
            };
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ orders })
        };

    } catch (error) {
        console.error('Admin get orders error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch orders' })
        };
    }
};
