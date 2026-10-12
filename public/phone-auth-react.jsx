// React 组件 - 阿里云 H5 号码认证
// 使用 React 17 API（与已安装版本匹配）

const e = React.createElement;

function PhoneAuthPage() {
  const [status, setStatus] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [carrier, setCarrier] = React.useState(null);
  const [carrierName, setCarrierName] = React.useState('');
  const [phone, setPhone] = React.useState('');

  const loadScript = (url) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = resolve;
    s.onerror = () => reject(new Error('加载失败: ' + url));
    const t = setTimeout(() => reject(new Error('超时')), 5000);
    s.onload = () => { clearTimeout(t); setTimeout(resolve, 200); };
    document.head.appendChild(s);
  });

  // 页面加载时自动检测
  React.useEffect(() => {
    detectCarrier();
  }, []);

  const detectCarrier = async () => {
    setStatus('正在检测运营商...');
    const oss = 'https://dypns-operator.oss-cn-hangzhou.aliyuncs.com';
    const vendors = [
      { id: 'CM', name: '中国移动', url: oss + '/jssdk-1.0.2.min.js', check: 'YDRZ' },
      { id: 'CT', name: '中国电信', url: oss + '/EAccountSDK-fjs-1.5.1.min.js', check: 'EAccountSDK' },
      { id: 'CU', name: '中国联通', url: oss + '/ispAuthPrefetch3.js', check: 'ispAuth' },
    ];
    for (const v of vendors) {
      try {
        await loadScript(v.url);
        if (window[v.check]) {
          setCarrier(v.id);
          setCarrierName(v.name);
          setStatus('');
          return;
        }
      } catch(e) {}
    }
    setCarrierName('');
    setStatus('⚠️ 未检测到运营商，可使用备用方式');
  };

  const startAuth = async () => {
    setLoading(true);
    setStatus('正在请求认证...');
    try {
      const res = await fetch('/api/auth/phone-login-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus('正在跳转...');
      window.location.href = data.url;
    } catch (err) {
      setStatus('❌ ' + err.message);
      setLoading(false);
    }
  };

  // Style
  const styles = {
    container: { textAlign:'center', padding:'40px 20px', maxWidth:360, margin:'0 auto', color:'#e2e8f0', fontFamily:'-apple-system,sans-serif' },
    logo: { fontSize:64, marginBottom:12 },
    h1: { fontSize:22, fontWeight:700, background:'linear-gradient(135deg,#a78bfa,#ec4899)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:8 },
    p: { color:'#94a3b8', fontSize:14, marginBottom:16, lineHeight:1.6 },
    btn: { width:'100%', padding:16, fontSize:17, fontWeight:600, background:'linear-gradient(135deg,#7c3aed,#ec4899)', color:'#fff', border:'none', borderRadius:12, cursor: loading?'not-allowed':'pointer', opacity: loading?.5:1, marginBottom:12 },
    msg: { fontSize:13, marginTop:16, minHeight:30, color: status.includes('❌')?'#ef4444':status.includes('✅')?'#22c55e':'#94a3b8' },
    carrier: { fontSize:12, color:'#475569', marginBottom:8 },
    input: { width:'100%', padding:'14px 16px', fontSize:16, background:'#1a1a2e', border:'1px solid #334155', borderRadius:10, color:'#e2e8f0', outline:'none', textAlign:'center', marginBottom:12 },
    inputFocus: { borderColor:'#7c3aed' },
    link: { display:'block', marginTop:20, color:'#64748b', fontSize:13, textDecoration:'none' },
  };

  return e('div', { style: styles.container },
    e('div', { style: styles.logo }, '📱'),
    e('h1', { style: styles.h1 }, '语音纪念人'),
    e('p', { style: styles.p }, '使用运营商网络快速认证\n请确保手机在 4G/5G 网络下'),
    carrierName ? e('p', { style: styles.carrier }, '📶 ' + carrierName) : null,
    e('button', { style: styles.btn, onClick: startAuth, disabled: loading, onFocus: (e) => e.target.style.border = 'none' },
      loading ? '⏳ 认证中...' : '📱 本机号码一键登录'
    ),
    e('p', { style: styles.msg }, status),
    e('a', { style: styles.link, href: '/' }, '← 使用密码登录'),
  );
}

ReactDOM.render(e(PhoneAuthPage), document.getElementById('root'));
