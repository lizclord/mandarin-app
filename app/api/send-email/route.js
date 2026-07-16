import sgMail from '@sendgrid/mail'

sgMail.setApiKey(process.env.SENDGRID_API_KEY)

export async function POST(request) {
  const { to, subject, html } = await request.json()

  try {
    await sgMail.send({
      to,
      from: { email: 'lizzandtheman@gmail.com', name: '中文 Weekly' },
      subject,
      html,
    })
    return Response.json({ success: true })
  } catch (e) {
    console.error('Sendgrid error:', e.response?.body || e.message)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
