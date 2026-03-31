const Airtable = require('airtable');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        const records = await base('SiteImages').select({
            sort: [{ field: 'SlotName', direction: 'asc' }]
        }).all();

        const images = {};
        records.forEach(record => {
            const slot = record.get('SlotName');
            if (slot) {
                images[slot] = {
                    url: record.get('ImageURL') || '',
                    alt: record.get('AltText') || ''
                };
            }
        });

        return {
            statusCode: 200,
            headers: {
                'Cache-Control': 'public, max-age=300'
            },
            body: JSON.stringify({ images })
        };

    } catch (error) {
        console.error('Get site images error:', error);
        return {
            statusCode: 200,
            body: JSON.stringify({ images: {} })
        };
    }
};
