<?php
session_start();
require 'includes/mail.php';

if (!isset($_SESSION['email']) || !isset($_SESSION['city'])) {
    die("Session expired. Please login again.");
}

$otp = rand(100000, 999999);
$_SESSION['otp'] = $otp;

$email = $_SESSION['email'];
$message = "Your new OTP for OffersCity is: <strong>$otp</strong>";

if (sendMail($email, "Resend OTP - OffersCity", $message)) {
    header("Location: verify_otp.php?resent=1");
    exit;
} else {
    echo "Failed to resend OTP. Try again.";
}
