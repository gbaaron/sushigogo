const Airtable = require('airtable');

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
        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        const showAll = event.queryStringParameters?.all === 'true';

        const options = {
            sort: [{ field: 'SortOrder', direction: 'asc' }]
        };

        if (!showAll) {
            options.filterByFormula = '{IsAvailable} = TRUE()';
        }

        const records = await base('MenuItems').select(options).all();

        const menuItems = records.map(record => ({
            id: record.id,
            name: record.get('Name'),
            category: record.get('Category'),
            price: record.get('Price'),
            description: record.get('Description'),
            imageUrl: record.get('ImageURL'),
            bonusPoints: record.get('BonusPoints') || 0,
            isAvailable: record.get('IsAvailable') !== false,
            avgRating: record.get('AvgRating') || 0,
            ratingCount: record.get('RatingCount') || 0,
            sortOrder: record.get('SortOrder') || 0
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ menuItems })
        };

    } catch (error) {
        console.error('Get menu error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch menu' })
        };
    }
};
