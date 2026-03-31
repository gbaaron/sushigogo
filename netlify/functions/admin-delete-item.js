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
        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Verify admin
        const user = await base('Users').find(decoded.userId);
        if (!user.get('IsAdmin')) {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin access required' }) };
        }

        const { itemId, hardDelete } = JSON.parse(event.body);

        if (!itemId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'itemId is required' }) };
        }

        if (hardDelete) {
            await base('MenuItems').destroy([itemId]);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, message: 'Menu item permanently deleted' })
            };
        }

        // Soft delete - set IsAvailable to false
        await base('MenuItems').update([{
            id: itemId,
            fields: { IsAvailable: false }
        }]);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: 'Menu item removed from menu' })
        };

    } catch (error) {
        console.error('Admin delete item error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to delete menu item' })
        };
    }
};
