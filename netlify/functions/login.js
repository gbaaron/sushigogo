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
        const { email, password } = JSON.parse(event.body);

        if (!email || !password) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email and password are required' }) };
        }

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        const records = await base('Users').select({
            filterByFormula: `{Email} = '${email.replace(/'/g, "\\'")}'`,
            maxRecords: 1
        }).firstPage();

        if (records.length === 0) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'Invalid email or password' })
            };
        }

        const user = records[0];
        const isValid = await bcrypt.compare(password, user.get('PasswordHash'));

        if (!isValid) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'Invalid email or password' })
            };
        }

        const token = jwt.sign(
            { userId: user.id, email: user.get('Email'), isAdmin: user.get('IsAdmin') || false },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                token,
                userId: user.id,
                name: user.get('Name'),
                email: user.get('Email'),
                points: user.get('Points') || 0,
                tier: user.get('TierLevel') || 'Bronze',
                isAdmin: user.get('IsAdmin') || false
            })
        };

    } catch (error) {
        console.error('Login error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Server error' })
        };
    }
};
