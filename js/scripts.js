function setCookie(name, value, days) {
  const d = new Date();
  d.setTime(d.getTime() + (days*24*60*60*1000));
  document.cookie = `${name}=${value}; expires=${d.toUTCString()}; path=/`;
}

function getCookie(name) {
  const cookies = document.cookie.split(';');
  for (let c of cookies) {
    let [key, val] = c.trim().split('=');
    if (key === name) return val;
  }
  return null;
}

window.onload = () => {
  if (!getCookie("subscribed")) {
    document.getElementById("subscribe-popup").style.display = "block";
  }
};

document.getElementById("subscribe-form").addEventListener("submit", function(e) {
  e.preventDefault();
  const mobile = document.getElementById("mobile").value.trim();
  const email = document.getElementById("email").value.trim();
  const city = document.getElementById("city").value;

  fetch("subscribe.php", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `mobile=${encodeURIComponent(mobile)}&email=${encodeURIComponent(email)}&city=${encodeURIComponent(city)}`
  })
  .then(res => res.text())
  .then(res => {
    if (res === "success" || res === "exists") {
      setCookie("subscribed", "yes", 365);
      document.getElementById("subscribe-popup").style.display = "none";
    } else {
      alert("Subscription failed. Please try again.");
    }
  });
});
