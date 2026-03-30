const Airtable = require('airtable');
const bcrypt = require('bcryptjs');

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
        const { name, email, phone, password, marketingEmails, birthday } = JSON.parse(event.body);

        if (!name || !name.trim()) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Please enter your name' })
            };
        }

        if (!email || !email.trim()) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Please enter your email address' })
            };
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Please enter a valid email address' })
            };
        }

        if (!password || password.length < 8) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Password must be at least 8 characters long' })
            };
        }

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        const existingRecords = await base('Users').select({
            filterByFormula: `{Email} = '${email.replace(/'/g, "\\'")}'`,
            maxRecords: 1
        }).firstPage();

        if (existingRecords.length > 0) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'An account with this email already exists. Try logging in instead!' })
            };
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const fields = {
            Email: email.trim().toLowerCase(),
            Name: name.trim(),
            Phone: phone || '',
            PasswordHash: passwordHash,
            Points: 0,
            MemberSince: new Date().toISOString().split('T')[0],
            TotalSpent: 0,
            TierLevel: 'Bronze',
            MarketingEmails: marketingEmails !== false
        };

        if (birthday) {
            fields.Birthday = birthday;
        }

        const newUser = await base('Users').create([{ fields }]);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                userId: newUser[0].id,
                name: name.trim(),
                message: 'Account created successfully'
            })
        };

    } catch (error) {
        console.error('Signup error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Something went wrong creating your account. Please try again.' })
        };
    }
};
