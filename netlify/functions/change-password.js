const Airtable = require('airtable');
const bcrypt = require('bcryptjs');
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
        const { currentPassword, newPassword } = JSON.parse(event.body);

        if (!currentPassword || !newPassword) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Both current and new password are required' })
            };
        }

        if (newPassword.length < 8) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'New password must be at least 8 characters' })
            };
        }

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
        const user = await base('Users').find(decoded.userId);

        const isValid = await bcrypt.compare(currentPassword, user.get('PasswordHash'));
        if (!isValid) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'Current password is incorrect' })
            };
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        await base('Users').update([{
            id: decoded.userId,
            fields: { PasswordHash: newHash }
        }]);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: 'Password changed successfully' })
        };

    } catch (error) {
        console.error('Change password error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to change password' })
        };
    }
};
