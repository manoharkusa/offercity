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
            background-color: #ffe0b2;
            padding: 15px 20px;
            border-bottom: 2px solid #ffb74d;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
        }
        .logo-center {
            flex: 1 1 100%;
            text-align: center;
            font-size: 22px;
            font-weight: bold;
            color: #e65100;
            margin-bottom: 10px;
        }
        .user-info {
            font-size: 14px;
            color: #555;
            text-align: right;
            width: 100%;
        }
        .logout-btn {
            padding: 5px 10px;
            background-color: #ff9800;
            border: none;
            border-radius: 5px;
            color: white;
            font-weight: bold;
            cursor: pointer;
            margin-left: 10px;
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

        @media screen and (min-width: 600px) {
            header {
                flex-wrap: nowrap;
            }
            .logo-center {
                flex: 1;
                margin: 0;
            }
            .user-info {
                width: auto;
            }
        }
    </style>
</head>
<body>

<header>
    <div class="logo-center">
        🔥 Welcome to OffersCity.co.in
    </div>
    <div class="user-info">
        👤 Logged in as: <strong><?= htmlspecialchars($emailOrMobile) ?></strong>
        <a href="logout.php"><button class="logout-btn">Logout</button></a>
    </div>
</header>

<main>
    <div class="city-selector">
        <strong>Selected City:</strong> <?= htmlspecialchars($city); ?>
    </div>

    <h2>🔥 Latest Offers</h2>
    <div class="marquee">
        <div class="marquee-content" id="marquee-content">
            <!-- Offers go here -->
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
