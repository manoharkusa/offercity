<?php
$host = "localhost";
$user = "a1751tyi_offeruser";
$pass = "Geetha22@#";
$dbname = "a1751tyi_offerscity";

$conn = new mysqli($host, $user, $pass, $dbname);

if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}
echo "Database connection successful!";
$conn->close();
?>
