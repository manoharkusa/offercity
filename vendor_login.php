<?php
include 'db_config.php';

$mobile = $_POST['mobile'];
$password = $_POST['password'];

$sql = "SELECT * FROM vendors WHERE mobile = ?";
$stmt = $conn->prepare($sql);
$stmt->bind_param("s", $mobile);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 1) {
    $row = $result->fetch_assoc();
    if (password_verify($password, $row['password_hash'])) {
        session_start();
        $_SESSION['vendor_id'] = $row['vendor_id'];
        $_SESSION['business_name'] = $row['business_name'];
        header("Location: upload_offer.html");
    } else {
        echo "Incorrect Password!";
    }
} else {
    echo "Vendor not found!";
}
?>
