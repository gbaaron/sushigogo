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

        const records = await base('Ratings').select({
            filterByFormula: `{UserID} = '${decoded.userId}'`
        }).all();

        const ratings = records.map(record => ({
            id: record.id,
            menuItemId: record.get('MenuItemID') ? record.get('MenuItemID')[0] : null,
            stars: record.get('Stars'),
            createdAt: record.get('CreatedAt'),
            updatedAt: record.get('UpdatedAt')
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ ratings })
        };

    } catch (error) {
        console.error('Get ratings error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch ratings' })
        };
    }
};
