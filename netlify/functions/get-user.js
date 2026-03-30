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

        // Get user's orders for count and points history
        const orderIds = user.get('Orders') || [];
        let orders = [];
        if (orderIds.length > 0) {
            const orderPromises = orderIds.map(id => base('Orders').find(id));
            orders = await Promise.all(orderPromises);
        }

        const pointsHistory = orders
            .filter(o => o.get('PointsEarned') > 0)
            .sort((a, b) => new Date(b.get('OrderDate')) - new Date(a.get('OrderDate')))
            .slice(0, 20)
            .map(o => ({
                orderId: o.id,
                date: o.get('OrderDate'),
                items: o.get('ItemsList'),
                points: o.get('PointsEarned'),
                total: o.get('Total'),
                status: o.get('Status')
            }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                userId: user.id,
                name: user.get('Name'),
                email: user.get('Email'),
                phone: user.get('Phone') || '',
                points: user.get('Points') || 0,
                totalSpent: user.get('TotalSpent') || 0,
                tierLevel: user.get('TierLevel') || 'Bronze',
                memberSince: user.get('MemberSince'),
                totalOrders: orderIds.length,
                marketingEmails: user.get('MarketingEmails') !== false,
                birthday: user.get('Birthday') || '',
                isAdmin: user.get('IsAdmin') || false,
                pointsHistory
            })
        };

    } catch (error) {
        console.error('Get user error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to get user data' })
        };
    }
};
