# Sushi GoGo -- Airtable Setup Guide

This guide walks you through setting up the Airtable backend for the Sushi GoGo sushi kiosk website.

---

## Step 1: Create the Airtable Base

1. Log in to [Airtable](https://airtable.com)
2. Click **"Create a base"** (or the **+** button)
3. Name the base **Sushi GoGo**

---

## Step 2: Create the Tables

You need **5 tables** in the base. For each table, import the matching CSV file from this folder, then verify/adjust the field types as described below.

> **Important:** The first table must be named **"Menu Items"** (with a space). This matches what the Netlify function code expects.

### Table 1: Menu Items

Import `MenuItems.csv`, then set the field types:

| Field         | Type                  | Notes                                                                                  |
| ------------- | --------------------- | -------------------------------------------------------------------------------------- |
| Name          | Single line text      | Primary field                                                                          |
| Category      | Single select         | Options: **Signature Rolls**, **Classic Rolls**, **Bowls**, **Sides**, **Drinks**      |
| Price         | Currency (USD)        |                                                                                        |
| Description   | Long text             |                                                                                        |
| ImageURL      | URL                   | Add image URLs later or leave blank for placeholder                                    |
| BonusPoints   | Number (integer)      |                                                                                        |
| IsAvailable   | Checkbox              | All should be checked after import                                                     |
| AvgRating     | Number (decimal 1.1)  | Starts at 0                                                                            |
| RatingCount   | Number (integer)      | Starts at 0                                                                            |
| SortOrder     | Number (integer)      | Controls display order on the menu page                                                |

### Table 2: Users

Import `Users.csv`, then set the field types:

| Field           | Type                 | Notes                                                      |
| --------------- | -------------------- | ---------------------------------------------------------- |
| Name            | Single line text     | Primary field                                              |
| Email           | Email                |                                                            |
| PasswordHash    | Single line text     | Stores bcrypt hash -- never store plain text passwords     |
| Phone           | Phone number         |                                                            |
| Points          | Number (integer)     |                                                            |
| TotalSpent      | Currency (USD)       |                                                            |
| TierLevel       | Single select        | Options: **Bronze**, **Silver**, **Gold**                  |
| MemberSince     | Date (ISO format)    |                                                            |
| Birthday        | Date (ISO format)    |                                                            |
| MarketingEmails | Checkbox             |                                                            |
| IsAdmin         | Checkbox             |                                                            |

### Table 3: Orders

Import `Orders.csv` (headers only), then set the field types:

| Field         | Type                 | Notes                                                                               |
| ------------- | -------------------- | ----------------------------------------------------------------------------------- |
| UserID        | Single line text     | Primary field. Stores the Airtable record ID of the user                            |
| OrderDate     | Date (include time)  |                                                                                     |
| PickupTime    | Date (include time)  |                                                                                     |
| ItemsList     | Long text            | Human-readable list of items (e.g., "2x Dragon Roll, 1x Edamame")                  |
| ItemsJSON     | Long text            | JSON array of order items with quantities and prices                                |
| Subtotal      | Currency (USD)       |                                                                                     |
| Tax           | Currency (USD)       |                                                                                     |
| Total         | Currency (USD)       |                                                                                     |
| PointsEarned  | Number (integer)     |                                                                                     |
| Status        | Single select        | Options: **Pending**, **Preparing**, **Ready**, **Completed**, **Cancelled**        |

### Table 4: Ratings

Import `Ratings.csv` (headers only), then set the field types:

| Field         | Type                 | Notes                                                         |
| ------------- | -------------------- | ------------------------------------------------------------- |
| UserID        | Single line text     | Primary field. Stores the Airtable record ID of the user      |
| MenuItemID    | Single line text     | Stores the Airtable record ID of the menu item                |
| Stars         | Number (integer)     | Value from 1 to 5                                             |
| CreatedAt     | Date (include time)  |                                                               |
| UpdatedAt     | Date (include time)  |                                                               |

### Table 5: RewardsTiers

Import `RewardsTiers.csv`, then set the field types:

| Field            | Type                | Notes                                            |
| ---------------- | ------------------- | ------------------------------------------------ |
| TierName         | Single line text    | Primary field                                    |
| MinimumPoints    | Number (integer)    |                                                  |
| PointsMultiplier | Number (decimal)    |                                                  |
| PerksDescription | Long text           |                                                  |
| BadgeColor       | Single line text    | Hex color code                                   |

---

## Step 3: Get Your Airtable Credentials

### Personal Access Token

1. Go to [airtable.com/create/tokens](https://airtable.com/create/tokens)
2. Click **"Create new token"**
3. Name it something like `sushi-gogo-site`
4. Under **Scopes**, add:
   - `data.records:read`
   - `data.records:write`
5. Under **Access**, add the **Sushi GoGo** base
6. Click **"Create token"** and copy it immediately (you cannot view it again)

### Base ID

1. Open your **Sushi GoGo** base in Airtable
2. Go to [airtable.com/api](https://airtable.com/api) (or look at the URL)
3. The Base ID starts with `app` and looks like `appXXXXXXXXXXXXXX`
4. You can also find it in the base URL: `https://airtable.com/appXXXXXXXXXXXXXX/...`

---

## Step 4: Deploy to Netlify

### Environment Variables

In your Netlify site settings, go to **Site settings > Environment variables** and add:

| Variable            | Value                              | Description                                |
| ------------------- | ---------------------------------- | ------------------------------------------ |
| `AIRTABLE_API_KEY`  | `pat...`                           | Your Airtable Personal Access Token        |
| `AIRTABLE_BASE_ID`  | `appXXXXXXXXXXXXXX`               | Your Airtable Base ID                      |
| `JWT_SECRET`        | *(generate a strong random string)*| Used for signing auth tokens               |

To generate a JWT secret, you can run this in your terminal:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Deploy

Push your code to the connected Git repo, or drag-and-drop the build folder into Netlify. The Netlify Functions in the `/netlify/functions/` directory will automatically detect the environment variables and connect to Airtable.

---

## Step 5: Create Your First Real User

1. Visit your deployed site and click **Sign Up**
2. Create an account with your real email and a strong password
3. Go back to the **Users** table in Airtable
4. Find your new user row
5. Check the **IsAdmin** checkbox for that user
6. Refresh the site -- you now have admin access

> The initial `Admin User` row in the CSV is a placeholder. You can delete it after creating your real admin account.

---

## Demo Mode

You can preview the rewards page with sample data by appending `?demo=true` to the rewards page URL:

```
https://your-site.netlify.app/rewards.html?demo=true
```

This loads mock tier data and sample point balances so you can see how the rewards UI looks without needing real order history.

---

## Quick Reference

### Menu Item Categories (Single Select)
- Signature Rolls
- Classic Rolls
- Bowls
- Sides
- Drinks

### Order Status Options (Single Select)
- Pending
- Preparing
- Ready
- Completed
- Cancelled

### User Tier Levels (Single Select)
- Bronze (0+ points, 1.0x multiplier)
- Silver (500+ points, 1.25x multiplier)
- Gold (1500+ points, 1.5x multiplier)

---

## Troubleshooting

- **"Table not found" errors**: Make sure the table is named **"Menu Items"** (with a space), not "MenuItems". The Netlify function code references the table name with a space.
- **401 Unauthorized from Airtable**: Double-check that your Personal Access Token has the correct scopes and is granted access to the Sushi GoGo base.
- **Empty menu on the site**: Verify that `AIRTABLE_BASE_ID` is correct and that the Menu Items table has records with `IsAvailable` checked.
- **Login not working**: Ensure `JWT_SECRET` is set in Netlify environment variables. The auth functions need it to sign and verify tokens.
