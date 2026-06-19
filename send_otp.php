<?php
ob_start(); // ← This buffers output to avoid breaking header()
session_start();

require 'includes/db.php';
require 'includes/mail.php';

$mobile = trim($_POST['mobile']);
$email = trim($_POST['email']);
$city = trim($_POST['city']);

if (!$mobile || !$email || !$city) {
    exit("All fields are required.");
}

// Convert to lowercase for uniformity
$mobile = strtolower($mobile);
$email = strtolower($email);

// Check if already subscribed
$stmt = $conn->prepare("SELECT * FROM subscribers WHERE LOWER(mobile) = ? AND LOWER(email) = ?");
$stmt->bind_param("ss", $mobile, $email);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows > 0) {
    $_SESSION['mobile'] = $mobile;
    $_SESSION['email'] = $email;
    $_SESSION['city'] = $city;
    $_SESSION['loggedin'] = true;
    $_SESSION['loggedin'] = true;
    header("Location: index.php?city=" . urlencode($city));
    exit;
}

// New user - generate OTP
$otp = rand(100000, 999999);
$_SESSION['otp'] = $otp;
$_SESSION['mobile'] = $mobile;
$_SESSION['email'] = $email;
$_SESSION['city'] = $city;

$message = "Your OTP for OffersCity login is: <strong>$otp</strong>";
if (sendMail($email, "OTP Verification", $message)) {
    header("Location: verify_otp.php");
    exit;
} else {
    exit("Failed to send OTP.");
}
