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
        const updates = JSON.parse(event.body);
        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        const allowedFields = {
            name: 'Name',
            email: 'Email',
            phone: 'Phone',
            marketingEmails: 'MarketingEmails',
            birthday: 'Birthday'
        };

        const fields = {};
        for (const [key, airtableField] of Object.entries(allowedFields)) {
            if (updates[key] !== undefined) {
                fields[airtableField] = updates[key];
            }
        }

        if (Object.keys(fields).length === 0) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'No valid fields to update' })
            };
        }

        if (fields.Email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(fields.Email)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Please enter a valid email address' })
                };
            }

            const existing = await base('Users').select({
                filterByFormula: `AND({Email} = '${fields.Email.replace(/'/g, "\\'")}', RECORD_ID() != '${decoded.userId}')`,
                maxRecords: 1
            }).firstPage();

            if (existing.length > 0) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'That email is already in use by another account' })
                };
            }

            fields.Email = fields.Email.trim().toLowerCase();
        }

        await base('Users').update([{ id: decoded.userId, fields }]);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: 'Profile updated successfully' })
        };

    } catch (error) {
        console.error('Update user error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to update profile' })
        };
    }
};
