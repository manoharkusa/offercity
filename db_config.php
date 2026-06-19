<?php
$host = "localhost";
$user = "offeruser";
$pass = "Geetha22@#";
$dbname = "a1751tyi_offerscity";

$conn = new mysqli($host, $user, $pass, $dbname);
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}
?>
