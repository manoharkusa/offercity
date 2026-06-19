<?php
// Database connection (replace with your actual DB credentials)
$dbHost = "localhost";
$dbUser = "offeruser";
$dbPass = "Geetha22@#";
$dbName = "a1751tyi_offerscity";
$conn = mysqli_connect($dbHost, $dbUser, $dbPass, $dbName);
if (!$conn) {
    die("Database connection failed: " . mysqli_connect_error());
}

// Only handle POST requests from the subscription form
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Retrieve form fields and escape for safety
    $mobile = mysqli_real_escape_string($conn, $_POST['mobile']);
    $email  = mysqli_real_escape_string($conn, $_POST['email']);
    $city   = mysqli_real_escape_string($conn, $_POST['city']);

    // Check if a subscriber with same mobile and email already exists
    $checkSql = "SELECT id FROM subscribers WHERE mobile='$mobile' AND email='$email'";
    $result = mysqli_query($conn, $checkSql);
    if ($result && mysqli_num_rows($result) == 0) {
        // No existing record, so insert a new subscriber
        $insertSql = "INSERT INTO subscribers (mobile, email, city) VALUES ('$mobile', '$email', '$city')";
        mysqli_query($conn, $insertSql);
    }
    // Set a cookie so the popup won't show again (expires in 1 year)
    setcookie("subscribed", "yes", time() + (86400 * 365), "/");  // 86400 = seconds in a day

    // Redirect back to homepage (index.html)
    header("Location: index.html");
    exit;
} else {
    // If this script is accessed directly without POST, just redirect to homepage
    header("Location: index.html");
    exit;
}
?>

