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

        const user = await base('Users').find(decoded.userId);
        const orderIds = user.get('Orders') || [];

        if (orderIds.length === 0) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ upcoming: [], past: [] })
            };
        }

        const orderPromises = orderIds.map(id => base('Orders').find(id));
        const orders = await Promise.all(orderPromises);

        const upcoming = [];
        const past = [];

        orders.forEach(order => {
            const orderData = {
                id: order.id,
                orderDate: order.get('OrderDate'),
                pickupTime: order.get('PickupTime'),
                items: order.get('ItemsList'),
                subtotal: order.get('Subtotal'),
                tax: order.get('Tax'),
                total: order.get('Total'),
                pointsEarned: order.get('PointsEarned'),
                status: order.get('Status')
            };

            if (['Pending', 'Preparing', 'Ready'].includes(orderData.status)) {
                upcoming.push(orderData);
            } else {
                past.push(orderData);
            }
        });

        upcoming.sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));
        past.sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));

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
