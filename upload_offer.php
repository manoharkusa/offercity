<?php
session_start();
include 'db_config.php';

if (!isset($_SESSION['vendor_id'])) {
    die("Unauthorized. Please login first.");
}

$vendor_id = $_SESSION['vendor_id'];
$business_name = $_SESSION['business_name'];
$city_name = $_POST['city_name'];
$description = $_POST['description'];
$display_days = $_POST['display_days'];

$target_dir = "uploads/";
$image_name = basename($_FILES["offer_image"]["name"]);
$target_file = $target_dir . time() . "_" . $image_name;

if (move_uploaded_file($_FILES["offer_image"]["tmp_name"], $target_file)) {
    $sql = "INSERT INTO offers (vendor_id, business_name, city_name, image_path, description, display_days)
            VALUES (?, ?, ?, ?, ?, ?)";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("issssi", $vendor_id, $business_name, $city_name, $target_file, $description, $display_days);
    $stmt->execute();

    echo "Offer uploaded successfully!";
} else {
    echo "Failed to upload image.";
}
?>
