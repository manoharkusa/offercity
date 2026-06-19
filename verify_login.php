<?php
session_start();

// DB Connection
$host = "localhost";
$user = "a1751tyi_offeruser";
$pass = "Geetha22@#";
$dbname = "a1751tyi_offerscity";

$conn = new mysqli($host, $user, $pass, $dbname);
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// Get user input
$mobile = $_POST['mobile'] ?? '';
$email = $_POST['email'] ?? '';
$city = $_POST['city'] ?? '';

// Sanitize
$mobile = trim($mobile);
$email = trim($email);
$city = trim($city);

// Check or Insert
$stmt = $conn->prepare("SELECT * FROM subscribers WHERE mobile = ? AND email = ?");
$stmt->bind_param("ss", $mobile, $email);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows == 0) {
    $insert = $conn->prepare("INSERT INTO subscribers (mobile, email, city) VALUES (?, ?, ?)");
    $insert->bind_param("sss", $mobile, $email, $city);
    if (!$insert->execute()) {
        die("Error inserting user.");
    }
}

// Set session and redirect
$_SESSION['loggedin'] = true;
$_SESSION['mobile'] = $mobile;
$_SESSION['email'] = $email;
$_SESSION['city'] = $city;

header("Location: index.php");
exit();
?>
