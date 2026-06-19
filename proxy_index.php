<?php
$node_url = "http://127.0.0.1:5002";
$request_uri = $_SERVER["REQUEST_URI"];
$method = $_SERVER["REQUEST_METHOD"];

// Forward /api/* and /uploads/* to Node.js
if (strpos($request_uri, "/api/") === 0 || $request_uri === "/api" || strpos($request_uri, "/uploads/") === 0) {
    $target = $node_url . $request_uri;
    $ch = curl_init($target);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);

    // Forward headers
    $headers = [];
    if (isset($_SERVER["HTTP_AUTHORIZATION"])) {
        $headers[] = "Authorization: " . $_SERVER["HTTP_AUTHORIZATION"];
    }
    if (isset($_SERVER["HTTP_CONTENT_TYPE"])) {
        $headers[] = "Content-Type: " . $_SERVER["HTTP_CONTENT_TYPE"];
    } elseif (isset($_SERVER["CONTENT_TYPE"])) {
        $headers[] = "Content-Type: " . $_SERVER["CONTENT_TYPE"];
    }
    if (isset($_SERVER["HTTP_ACCEPT"])) {
        $headers[] = "Accept: " . $_SERVER["HTTP_ACCEPT"];
    }
    if (!empty($headers)) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    }

    // Forward request body for POST/PUT/PATCH
    if (in_array($method, ["POST", "PUT", "PATCH"])) {
        $body = file_get_contents("php://input");
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }

    // Capture response headers
    $response_headers = [];
    curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($curl, $header) use (&$response_headers) {
        $len = strlen($header);
        $h = explode(":", $header, 2);
        if (count($h) === 2) {
            $response_headers[strtolower(trim($h[0]))] = trim($h[1]);
        }
        return $len;
    });

    $body = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curl_error = curl_error($ch);
    curl_close($ch);

    if ($curl_error) {
        http_response_code(502);
        header("Content-Type: application/json");
        echo json_encode(["error" => "Node.js server unavailable", "detail" => $curl_error]);
        exit;
    }

    http_response_code($http_code ?: 200);
    if (isset($response_headers["content-type"])) {
        header("Content-Type: " . $response_headers["content-type"]);
    } else {
        header("Content-Type: application/json");
    }
    echo $body;
    exit;
}

// Serve React build assets directly
if (strpos($request_uri, "/assets/") === 0) {
    $file = __DIR__ . "/client/dist" . $request_uri;
    if (file_exists($file)) {
        $ext = pathinfo($file, PATHINFO_EXTENSION);
        $types = ["js" => "application/javascript", "css" => "text/css",
                  "png" => "image/png", "jpg" => "image/jpeg",
                  "svg" => "image/svg+xml", "ico" => "image/x-icon",
                  "woff2" => "font/woff2", "woff" => "font/woff"];
        if (isset($types[$ext])) header("Content-Type: " . $types[$ext]);
        readfile($file);
        exit;
    }
}

// Serve React SPA for everything else
$index = __DIR__ . "/client/dist/index.html";
if (file_exists($index)) {
    header("Content-Type: text/html");
    readfile($index);
} else {
    http_response_code(503);
    echo "Site is being deployed. Please check back shortly.";
}
?>
