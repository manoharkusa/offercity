<?php
session_start();
if (!isset($_SESSION['loggedin'])) {
    header("Location: login.html");
    exit;
}

$city = $_SESSION['city'];
$emailOrMobile = $_SESSION['email'] ?? $_SESSION['mobile'] ?? 'Guest';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>OffersCity.co.in - Today’s Best Offers</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            background-color: #fffaf2;
        }

        header {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
            background-color: #ffe0b2;
            padding: 10px 20px;
            border-bottom: 2px solid #ffb74d;
        }

        header h1 {
            margin: 0;
            font-size: 22px;
            color: #e65100;
        }

        nav a {
            margin-right: 15px;
            text-decoration: none;
            color: #333;
            font-weight: bold;
        }

        .user-info {
            font-size: 14px;
            color: #555;
            display: flex;
            align-items: center;
        }

        .logout-btn {
            background-color: #ff7043;
            color: #fff;
            border: none;
            padding: 5px 10px;
            margin-left: 10px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 13px;
        }

        main {
            padding: 20px;
        }

        .city-selector {
            font-size: 18px;
            margin-bottom: 20px;
        }

        h2 {
            color: #e65100;
        }

        .marquee {
            overflow: hidden;
            white-space: nowrap;
            background: #fff3e0;
            padding: 10px 0;
        }

        .marquee-content span {
            display: inline-block;
            margin-right: 50px;
            animation: scroll 15s linear infinite;
            font-weight: bold;
            color: #d84315;
        }

        @keyframes scroll {
            0% { transform: translateX(100%); }
            100% { transform: translateX(-100%); }
        }

        footer {
            text-align: center;
            padding: 10px;
            font-size: 12px;
            color: #999;
            border-top: 1px solid #eee;
            background-color: #fffaf2;
        }

        @media (max-width: 768px) {
            header {
                flex-direction: column;
                align-items: flex-start;
            }

            .user-info {
                margin-top: 10px;
                width: 100%;
                justify-content: space-between;
            }

            nav {
                margin-top: 10px;
            }

            .logout-btn {
                margin-left: auto;
            }
        }
    </style>
</head>
<body>

<header>
    <div>
        <h1>🔥 OffersCity.co.in</h1>
        <nav>
            <a href="#">Home</a>
            <a href="#">Categories</a>
            <a href="#">Contact</a>
        </nav>
    </div>
    <div class="user-info">
        👤 <strong><?= htmlspecialchars($emailOrMobile) ?></strong>
        <form action="logout.php" method="POST" style="display:inline;">
            <button type="submit" class="logout-btn">Logout</button>
        </form>
    </div>
</header>

<main>
    <div class="city-selector">
        <strong>Selected City:</strong> <?= htmlspecialchars($city); ?>
    </div>

    <h2>🔥 Latest Offers</h2>
    <div class="marquee">
        <div class="marquee-content" id="marquee-content">
            <!-- Offers will scroll here -->
        </div>
    </div>
</main>

<footer>
    © 2025 OffersCity. All Rights Reserved.
</footer>

<script>
    const city = "<?= strtolower($city); ?>";
    const cityOffers = {
        sirsilla: [
            "Discount on Kurta Sets at ShopX",
            "Buy 1 Get 1 Free – Sirsilla Sarees",
            "20% off on Groceries – LocalMart",
            "Flat ₹100 off on recharge at Sirsilla Cafe"
        ],
        karimnagar: [
            "Mega Sale – Electronics",
            "40% off on Salon Services",
            "Special Dinner Offer – Hotel Krishna"
        ],
        hyderabad: [
            "Weekend Fashion Deals – Hyderabad",
            "Flat ₹200 Cashback on Orders"
        ]
    };

    const offers = cityOffers[city] || [];
    document.getElementById("marquee-content").innerHTML = offers.map(o => `<span>${o}</span>`).join(" ");
</script>

</body>
</html>
