export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">

        {/* Brand */}
        <div className="footer-brand">
          <div className="footer-logo">🏪 OfferCity</div>
          <p className="footer-tagline">Discover the best deals &amp; offers from shops near you.</p>
          <p className="footer-copy">© {year} OfferCity. All rights reserved.</p>
        </div>

        {/* Company */}
        <div className="footer-col">
          <div className="footer-col-title">Company</div>
          <a href="#">About Us</a>
          <a href="#">Careers</a>
          <a href="#">Partner With Us</a>
          <a href="#">Advertise</a>
        </div>

        {/* Contact */}
        <div className="footer-col">
          <div className="footer-col-title">Contact</div>
          <a href="#">Help &amp; Support</a>
          <a href="#">Report an Issue</a>
          <a href="mailto:hello@offercity.in">hello@offercity.in</a>
        </div>

        {/* Available In */}
        <div className="footer-col">
          <div className="footer-col-title">Available In</div>
          <a href="#">Hyderabad</a>
          <a href="#">Bangalore</a>
          <a href="#">Chennai</a>
          <a href="#">Mumbai</a>
          <a href="#">Delhi</a>
          <span className="footer-more">+ more cities coming</span>
        </div>

        {/* Legal + Social */}
        <div className="footer-col">
          <div className="footer-col-title">Legal</div>
          <a href="#">Terms &amp; Conditions</a>
          <a href="#">Privacy Policy</a>
          <a href="#">Cookie Policy</a>

          <div className="footer-col-title" style={{ marginTop: 20 }}>Follow Us</div>
          <div className="footer-social">
            <a href="#" aria-label="Instagram">📸</a>
            <a href="#" aria-label="Facebook">👥</a>
            <a href="#" aria-label="Twitter">🐦</a>
            <a href="#" aria-label="LinkedIn">💼</a>
          </div>
        </div>

      </div>
    </footer>
  );
}
