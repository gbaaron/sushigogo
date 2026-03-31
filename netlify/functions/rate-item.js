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
        const { menuItemId, stars } = JSON.parse(event.body);

        if (!menuItemId || !stars || stars < 1 || stars > 5 || !Number.isInteger(stars)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Valid menuItemId and stars (1-5 integer) required' })
            };
        }

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Check for existing rating by this user on this item
        const existingRatings = await base('Ratings').select({
            filterByFormula: `AND({UserID} = '${decoded.userId}', {MenuItemID} = '${menuItemId}')`,
            maxRecords: 1
        }).firstPage();

        const now = new Date().toISOString();

        if (existingRatings.length > 0) {
            // Update existing rating
            await base('Ratings').update([{
                id: existingRatings[0].id,
                fields: {
                    Stars: stars,
                    UpdatedAt: now
                }
            }]);
        } else {
            // Create new rating
            await base('Ratings').create([{
                fields: {
                    UserID: [decoded.userId],
                    MenuItemID: [menuItemId],
                    Stars: stars,
                    CreatedAt: now,
                    UpdatedAt: now
                }
            }]);
        }

        // Recompute average rating for this menu item
        const allRatings = await base('Ratings').select({
            filterByFormula: `{MenuItemID} = '${menuItemId}'`
        }).all();

        const totalStars = allRatings.reduce((sum, r) => sum + (r.get('Stars') || 0), 0);
        const ratingCount = allRatings.length;
        const avgRating = ratingCount > 0 ? Math.round((totalStars / ratingCount) * 100) / 100 : 0;

        await base('MenuItems').update([{
            id: menuItemId,
            fields: {
                AvgRating: avgRating,
                RatingCount: ratingCount
            }
        }]);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                avgRating,
                ratingCount,
                userRating: stars
            })
        };

    } catch (error) {
        console.error('Rate item error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to submit rating' })
        };
    }
};
