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

        // Fetch user's ratings
        const userRatings = await base('Ratings').select({
            filterByFormula: `{UserID} = '${decoded.userId}'`
        }).all();

        // Fetch all available menu items
        const allItems = await base('Menu Items').select({
            filterByFormula: '{IsAvailable} = TRUE()'
        }).all();

        const ratedItemIds = new Set(
            userRatings.map(r => r.get('MenuItemID') ? r.get('MenuItemID')[0] : null).filter(Boolean)
        );

        const unratedItems = allItems.filter(item => !ratedItemIds.has(item.id));

        // If user has fewer than 3 ratings, return popular items fallback
        if (userRatings.length < 3) {
            const popular = unratedItems
                .filter(item => (item.get('RatingCount') || 0) >= 1)
                .sort((a, b) => (b.get('AvgRating') || 0) - (a.get('AvgRating') || 0))
                .slice(0, 8);

            // If not enough rated items, fill with any unrated items
            if (popular.length < 8) {
                const remaining = unratedItems
                    .filter(item => !popular.find(p => p.id === item.id))
                    .slice(0, 8 - popular.length);
                popular.push(...remaining);
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    recommendations: popular.map(formatItem),
                    strategy: 'popular'
                })
            };
        }

        // Build category affinity scores from user's ratings
        const categoryScores = {};
        for (const rating of userRatings) {
            const itemId = rating.get('MenuItemID') ? rating.get('MenuItemID')[0] : null;
            if (!itemId) continue;

            const item = allItems.find(i => i.id === itemId);
            if (!item) continue;

            const category = item.get('Category');
            const stars = rating.get('Stars') || 0;

            if (!categoryScores[category]) {
                categoryScores[category] = { totalStars: 0, count: 0 };
            }
            categoryScores[category].totalStars += stars;
            categoryScores[category].count += 1;
        }

        // Compute averages
        for (const cat of Object.keys(categoryScores)) {
            categoryScores[cat].avg = categoryScores[cat].totalStars / categoryScores[cat].count;
        }

        // Find max bonus points for normalization
        const maxBonus = Math.max(...allItems.map(i => i.get('BonusPoints') || 0), 1);

        // Score each unrated item
        const scored = unratedItems.map(item => {
            const category = item.get('Category');
            const categoryAffinity = categoryScores[category] ? categoryScores[category].avg : 3.0;
            const itemAvg = item.get('AvgRating') || 0;
            const bonusNorm = (item.get('BonusPoints') || 0) / maxBonus;

            const score = (categoryAffinity * 0.6) + (itemAvg * 0.3) + (bonusNorm * 0.1);

            return { item, score, category };
        });

        scored.sort((a, b) => b.score - a.score);

        // Take top 8 with diversity enforcement
        let results = scored.slice(0, 8);

        // Ensure at least 1 item from a non-preferred category
        const preferredCategories = Object.entries(categoryScores)
            .filter(([, data]) => data.avg >= 4.0)
            .map(([cat]) => cat);

        const allSameCategory = results.length > 2 &&
            results.every(r => r.category === results[0].category);

        if (allSameCategory && scored.length > 8) {
            const diverse = scored.find(s =>
                s.category !== results[0].category &&
                !results.find(r => r.item.id === s.item.id)
            );
            if (diverse) {
                results[results.length - 1] = diverse;
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                recommendations: results.map(r => formatItem(r.item)),
                strategy: 'personalized',
                categoryAffinities: Object.fromEntries(
                    Object.entries(categoryScores).map(([cat, data]) => [cat, Math.round(data.avg * 10) / 10])
                )
            })
        };

    } catch (error) {
        console.error('Recommendations error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to get recommendations' })
        };
    }
};

function formatItem(record) {
    return {
        id: record.id,
        name: record.get('Name'),
        category: record.get('Category'),
        price: record.get('Price'),
        description: record.get('Description'),
        imageUrl: record.get('ImageURL'),
        bonusPoints: record.get('BonusPoints') || 0,
        avgRating: record.get('AvgRating') || 0,
        ratingCount: record.get('RatingCount') || 0
    };
}
