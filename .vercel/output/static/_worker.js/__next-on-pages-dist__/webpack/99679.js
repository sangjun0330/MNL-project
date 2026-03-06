var R={},B=(w,M,O)=>(R.__chunk_99679=(T,S,q)=>{"use strict";q.d(S,{$:()=>A,g:()=>E});let v=process.env.REFUND_ADMIN_EMAIL??"";function r(t){return String(t??"").trim()}function e(t){return t.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}function a(t){return`${Math.max(0,Math.round(t)).toLocaleString("ko-KR")} KRW`}function b(t){return/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)}function m(t){let d=r(t).toLowerCase();if(!b(d))return d;let[l,s]=d.split("@");return s==="gmail.com"||s==="googlemail.com"?`${l.split("+")[0].replaceAll(".","")}@gmail.com`:d}function k(t){return String(t).split(`
`).filter(d=>!/(요청\s*id|요청id|사용자\s*id|사용자id|주문\s*id|주문id|request\s*id|requestid|user\s*id|userid|order\s*id|orderid)/i.test(d)).join(`
`)}function N(t){return String(t).replace(/<tr>\s*<td[^>]*>\s*(요청\s*ID|요청ID|사용자\s*ID|사용자ID|주문\s*ID|주문ID|Request\s*ID|RequestID|User\s*ID|UserID|Order\s*ID|OrderID|orderId|userId|requestId)\s*<\/td>\s*<td[^>]*>[\s\S]*?<\/td>\s*<\/tr>/gi,"")}async function y(t){let d=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${t.apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({from:t.from,to:t.to,reply_to:t.replyTo,subject:t.subject,text:t.text,html:t.html})});if(!d.ok){let l=await d.text().catch(()=>"");return{ok:!1,message:`resend_http_${d.status}:${l.slice(0,180)}`}}return{ok:!0,message:"ok"}}async function A(t){let d=r(process.env.RESEND_API_KEY);if(!d)return{sent:!1,message:"missing_resend_api_key"};let l=r(process.env.BILLING_REFUND_FROM_EMAIL)||"onboarding@resend.dev",s=`[RNest] \uD658\uBD88 \uC694\uCCAD \uC811\uC218 #${t.requestId}`,x=r(t.reason)||"\uC0AC\uC6A9\uC790 \uC694\uCCAD",n=r(t.requestedAt)||new Date().toISOString(),i=r(t.requesterEmail),g=m(i),o=b(i),p=[v],c=o?p.filter(I=>m(I)!==g):p;if(!c.length)return{sent:!1,message:"missing_refund_notify_recipients"};let _=[`RNest \uD658\uBD88 \uC694\uCCAD\uC774 \uC811\uC218\uB418\uC5C8\uC2B5\uB2C8\uB2E4.
`,`\uC694\uCCAD ID: ${t.requestId}`,`\uC0AC\uC6A9\uC790 ID: ${t.userId}`,`\uC0AC\uC6A9\uC790 \uC774\uBA54\uC77C: ${o?i:"-"}`,`\uC8FC\uBB38 ID: ${t.orderId}`,`\uD50C\uB79C: ${t.planTier}`,`\uACB0\uC81C \uAE08\uC561: ${a(t.amount)}`,`\uC694\uCCAD \uC2DC\uAC01: ${n}`,`
[\uD658\uBD88 \uC0AC\uC720]`,x,`
\uC8FC\uC758: \uD604\uC7AC \uC2DC\uC2A4\uD15C\uC740 \uC790\uB3D9 \uD658\uBD88\uC744 \uC218\uD589\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uAD00\uB9AC\uC790\uAC00 \uC0AC\uC720 \uAC80\uD1A0 \uD6C4 \uC218\uB3D9 \uCC98\uB9AC\uD574\uC57C \uD569\uB2C8\uB2E4.`].join(`
`),h=`
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.55;">
      <h2 style="margin:0 0 12px;">RNest \uD658\uBD88 \uC694\uCCAD \uC811\uC218</h2>
      <p style="margin:0 0 12px;">\uAD00\uB9AC\uC790 \uAC80\uD1A0 \uD6C4 \uC218\uB3D9\uC73C\uB85C \uD658\uBD88 \uCC98\uB9AC\uD574\uC57C \uD569\uB2C8\uB2E4.</p>
      <table style="border-collapse:collapse;">
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uC694\uCCAD ID</td><td style="padding:4px 0;">${t.requestId}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uC0AC\uC6A9\uC790 ID</td><td style="padding:4px 0;">${e(t.userId)}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uC0AC\uC6A9\uC790 \uC774\uBA54\uC77C</td><td style="padding:4px 0;">${o?e(i):"-"}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uC8FC\uBB38 ID</td><td style="padding:4px 0;">${e(t.orderId)}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uD50C\uB79C</td><td style="padding:4px 0;">${e(t.planTier)}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uACB0\uC81C \uAE08\uC561</td><td style="padding:4px 0;">${a(t.amount)}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uC694\uCCAD \uC2DC\uAC01</td><td style="padding:4px 0;">${e(n)}</td></tr>
      </table>
      <div style="margin-top:14px;padding:10px 12px;border:1px solid #ddd;border-radius:10px;background:#fafafa;">
        <div style="margin-bottom:6px;color:#666;">\uD658\uBD88 \uC0AC\uC720</div>
        <div>${e(x)}</div>
      </div>
    </div>
  `.trim(),u=await y({apiKey:d,from:l,to:c,replyTo:o?i:void 0,subject:s,text:_,html:h});if(!u.ok)return{sent:!1,message:u.message};if(!o)return{sent:!0,message:"admin_sent_user_skipped"};let f=k([`RNest \uD658\uBD88 \uC694\uCCAD\uC774 \uC811\uC218\uB418\uC5C8\uC2B5\uB2C8\uB2E4.
`,`\uC0AC\uC6A9\uC790 \uC774\uBA54\uC77C: ${i}`,`\uACB0\uC81C \uAE08\uC561: ${a(t.amount)}`,`\uC694\uCCAD \uC2DC\uAC01: ${n}`,`
[\uD658\uBD88 \uC0AC\uC720]`,x,`
\uAD00\uB9AC\uC790 \uAC80\uD1A0 \uD6C4 \uC21C\uCC28 \uCC98\uB9AC\uB418\uBA70, \uCC98\uB9AC \uACB0\uACFC\uB294 \uBCC4\uB3C4 \uC548\uB0B4\uB429\uB2C8\uB2E4.`].join(`
`)),D=N(`
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.55;">
      <h2 style="margin:0 0 12px;">RNest \uD658\uBD88 \uC694\uCCAD \uC811\uC218</h2>
      <p style="margin:0 0 12px;">\uC694\uCCAD\uC774 \uC815\uC0C1 \uC811\uC218\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uAD00\uB9AC\uC790 \uAC80\uD1A0 \uD6C4 \uC21C\uCC28 \uCC98\uB9AC\uB429\uB2C8\uB2E4.</p>
      <table style="border-collapse:collapse;">
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uC0AC\uC6A9\uC790 \uC774\uBA54\uC77C</td><td style="padding:4px 0;">${e(i)}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uACB0\uC81C \uAE08\uC561</td><td style="padding:4px 0;">${a(t.amount)}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uC694\uCCAD \uC2DC\uAC01</td><td style="padding:4px 0;">${e(n)}</td></tr>
      </table>
      <div style="margin-top:14px;padding:10px 12px;border:1px solid #ddd;border-radius:10px;background:#fafafa;">
        <div style="margin-bottom:6px;color:#666;">\uD658\uBD88 \uC0AC\uC720</div>
        <div>${e(x)}</div>
      </div>
    </div>
  `.trim()),$=await y({apiKey:d,from:l,to:[i],subject:"[RNest] \uD658\uBD88 \uC694\uCCAD\uC774 \uC811\uC218\uB418\uC5C8\uC2B5\uB2C8\uB2E4",text:f,html:D});return $.ok?{sent:!0,message:"admin_sent_user_sent"}:{sent:!0,message:`admin_sent_user_failed:${$.message}`}}async function E(t){let d=r(process.env.RESEND_API_KEY);if(!d)return{sent:!1,message:"missing_resend_api_key"};let l=r(process.env.BILLING_REFUND_FROM_EMAIL)||"onboarding@resend.dev",s=r(t.requesterEmail),x=m(s),n=b(s),i=r(t.requestedAt)||new Date().toISOString(),g=r(t.rejectedAt)||new Date().toISOString(),o=r(t.reason)||"\uD658\uBD88 \uAC70\uC808 \uC0AC\uC720\uAC00 \uC81C\uACF5\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.",p=r(t.reviewNote),c=`[RNest] \uD658\uBD88 \uC694\uCCAD \uAC70\uC808 #${t.requestId}`,_=["RNest \uD658\uBD88 \uC694\uCCAD\uC774 \uAC70\uC808 \uCC98\uB9AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.","",`\uC694\uCCAD ID: ${t.requestId}`,`\uC0AC\uC6A9\uC790 ID: ${t.userId}`,`\uC0AC\uC6A9\uC790 \uC774\uBA54\uC77C: ${n?s:"-"}`,`\uC8FC\uBB38 ID: ${t.orderId}`,`\uD50C\uB79C: ${t.planTier}`,`\uACB0\uC81C \uAE08\uC561: ${a(t.amount)}`,`\uC694\uCCAD \uC2DC\uAC01: ${i}`,`\uAC70\uC808 \uC2DC\uAC01: ${g}`,"","[\uD658\uBD88 \uAC70\uC808 \uC0AC\uC720]",o,...p?["","[\uAD00\uB9AC\uC790 \uBA54\uBAA8]",p]:[]].filter(Boolean).join(`
`),h=`
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.55;">
      <h2 style="margin:0 0 12px;">RNest \uD658\uBD88 \uC694\uCCAD \uAC70\uC808</h2>
      <p style="margin:0 0 12px;">\uAD00\uB9AC\uC790\uC5D0 \uC758\uD574 \uD658\uBD88 \uC694\uCCAD\uC774 \uAC70\uC808\uB418\uC5C8\uC2B5\uB2C8\uB2E4.</p>
      <table style="border-collapse:collapse;">
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uC694\uCCAD ID</td><td style="padding:4px 0;">${t.requestId}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uC0AC\uC6A9\uC790 ID</td><td style="padding:4px 0;">${e(t.userId)}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uC0AC\uC6A9\uC790 \uC774\uBA54\uC77C</td><td style="padding:4px 0;">${n?e(s):"-"}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uC8FC\uBB38 ID</td><td style="padding:4px 0;">${e(t.orderId)}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uD50C\uB79C</td><td style="padding:4px 0;">${e(t.planTier)}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uACB0\uC81C \uAE08\uC561</td><td style="padding:4px 0;">${a(t.amount)}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uC694\uCCAD \uC2DC\uAC01</td><td style="padding:4px 0;">${e(i)}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uAC70\uC808 \uC2DC\uAC01</td><td style="padding:4px 0;">${e(g)}</td></tr>
      </table>
      <div style="margin-top:14px;padding:10px 12px;border:1px solid #ddd;border-radius:10px;background:#fafafa;">
        <div style="margin-bottom:6px;color:#666;">\uD658\uBD88 \uAC70\uC808 \uC0AC\uC720</div>
        <div>${e(o)}</div>
      </div>
      ${p?`<div style="margin-top:10px;padding:10px 12px;border:1px solid #eee;border-radius:10px;background:#fff;">
        <div style="margin-bottom:6px;color:#666;">\uAD00\uB9AC\uC790 \uBA54\uBAA8</div>
        <div>${e(p)}</div>
      </div>`:""}
    </div>
  `.trim(),u=n?[v].filter(j=>m(j)!==x):[v],f=await y({apiKey:d,from:l,to:u,replyTo:n?s:void 0,subject:c,text:_,html:h});if(!f.ok)return{sent:!1,message:f.message};if(!n)return{sent:!0,message:"admin_sent_user_skipped"};let D=k(["RNest \uD658\uBD88 \uC694\uCCAD \uCC98\uB9AC \uACB0\uACFC\uB97C \uC548\uB0B4\uB4DC\uB9BD\uB2C8\uB2E4.","",`\uC0AC\uC6A9\uC790 \uC774\uBA54\uC77C: ${s}`,`\uACB0\uC81C \uAE08\uC561: ${a(t.amount)}`,`\uC694\uCCAD \uC2DC\uAC01: ${i}`,`\uAC70\uC808 \uC2DC\uAC01: ${g}`,"","[\uD658\uBD88 \uAC70\uC808 \uC0AC\uC720]",o,...p?["","[\uC548\uB0B4 \uBA54\uBAA8]",p]:[]].filter(Boolean).join(`
`)),$=N(`
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.55;">
      <h2 style="margin:0 0 12px;">RNest \uD658\uBD88 \uC694\uCCAD \uAC70\uC808 \uC548\uB0B4</h2>
      <p style="margin:0 0 12px;">\uC694\uCCAD\uD558\uC2E0 \uD658\uBD88\uC740 \uAC80\uD1A0 \uACB0\uACFC \uAC70\uC808 \uCC98\uB9AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.</p>
      <table style="border-collapse:collapse;">
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uC0AC\uC6A9\uC790 \uC774\uBA54\uC77C</td><td style="padding:4px 0;">${e(s)}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uACB0\uC81C \uAE08\uC561</td><td style="padding:4px 0;">${a(t.amount)}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uC694\uCCAD \uC2DC\uAC01</td><td style="padding:4px 0;">${e(i)}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">\uAC70\uC808 \uC2DC\uAC01</td><td style="padding:4px 0;">${e(g)}</td></tr>
      </table>
      <div style="margin-top:14px;padding:10px 12px;border:1px solid #ddd;border-radius:10px;background:#fafafa;">
        <div style="margin-bottom:6px;color:#666;">\uD658\uBD88 \uAC70\uC808 \uC0AC\uC720</div>
        <div>${e(o)}</div>
      </div>
      ${p?`<div style="margin-top:10px;padding:10px 12px;border:1px solid #eee;border-radius:10px;background:#fff;">
        <div style="margin-bottom:6px;color:#666;">\uC548\uB0B4 \uBA54\uBAA8</div>
        <div>${e(p)}</div>
      </div>`:""}
    </div>
  `.trim()),I=await y({apiKey:d,from:l,to:[s],subject:"[RNest] \uD658\uBD88 \uC694\uCCAD\uC774 \uAC70\uC808\uB418\uC5C8\uC2B5\uB2C8\uB2E4",text:D,html:$});return I.ok?{sent:!0,message:"admin_sent_user_sent"}:{sent:!0,message:`admin_sent_user_failed:${I.message}`}}},R);export{B as __getNamedExports};
