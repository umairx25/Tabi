const form = document.getElementById('waitlistForm');
const successMessage = document.getElementById('successMessage');
const emailInput = document.getElementById('emailInput');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value;
    const submitButton = form.querySelector('.btn-primary');
    
    // Disable button
    submitButton.disabled = true;
    submitButton.textContent = 'Joining...';
    
    try {
        const response = await fetch('https://sheetdb.io/api/v1/ckb0ew2uisxjg', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                data: [{
                    Email: email,
                    Timestamp: new Date().toISOString(),
                    Source: 'landing_page'
                }]
            })
        });

        if (response.ok) {
            successMessage.style.display = 'block';
            emailInput.value = '';
            
            setTimeout(() => {
                successMessage.style.display = 'none';
            }, 5000);
        } else {
            throw new Error('Submission failed');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Something went wrong. Please try again.');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Join Waitlist';
    }
});

// Keep your existing smooth scroll code
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
        }
    });
});