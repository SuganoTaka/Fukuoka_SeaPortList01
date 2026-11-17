const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const jstDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const stations = {
  QF: { name: '博多', lat: 33 + 37 / 60, lng: 130.4 },
  KA: { name: '唐津', lat: 33 + 28 / 60, lng: 129 + 58 / 60 },
  O3: { name: '苅田', lat: 33.8, lng: 131 },
  O6: { name: '大牟田', lat: 33 + 1 / 60, lng: 130 + 25 / 60 }
};
const areaColors = { '筑前海': '#83c9b8', '豊前海': '#f1a45d', '有明海': '#86a8d7' };
let ports = [], map, markers = [], renderer, selected, requestId = 0, locationPoint, selectedArea = '', fallbackStarted = false;

function distance(a, b) {
  const radians = n => n * Math.PI / 180;
  const dLat = radians(b.lat - a.lat), dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function stationFor(port) {
  if (port.area === '豊前海') return 'O3';
  if (port.area === '有明海') return 'O6';
  return distance(port, stations.QF) <= distance(port, stations.KA) ? 'QF' : 'KA';
}
function visiblePorts() {
  const term = $('#search').value.trim().toLowerCase();
  return ports.filter(p => (!selectedArea || p.area === selectedArea) && (p.name + '漁港').toLowerCase().includes(term));
}
function renderList() {
  const visible = visiblePorts();
  $('#count').textContent = `${visible.length} / ${ports.length} 港`;
  $('#port-list').innerHTML = visible.length ? visible.map(p =>
    `<button class="port-item ${selected?.id === p.id ? 'active' : ''}" data-id="${p.id}"><span class="port-indicator" style="--spot-color:${areaColors[p.area]}">⌖</span><span><strong>${escapeHtml(p.name)}漁港</strong><small>${escapeHtml(p.area)} · 参考位置</small></span><span class="arrow">↗</span></button>`
  ).join('') : '<p class="no-results">該当する漁港はありません。</p>';
  markers.forEach(({ port, setVisible, setSelected }) => {
    setVisible(visible.includes(port));
    setSelected(port.id === selected?.id);
  });
}
function fishFor(port) {
  const month = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', month: 'numeric' }).format(new Date()));
  if (port.name === '沖の島') return '沖ノ島への一般上陸は原則できません。釣行先として案内していません。';
  if (port.area === '有明海') {
    const fish = ['チヌ', ...(month >= 7 && month <= 11 ? ['ハゼ'] : [])];
    return `有明海沿岸の季節の目安：${fish.join('・')}。漁港ごとの釣果や釣りの許可を示すものではありません。`;
  }
  const fish = ['チヌ', ...(month >= 6 && month <= 11 ? ['アジ'] : []), ...(month >= 6 && month <= 8 ? ['キス'] : []), ...([12, 1, 2, 3, 4, 5].includes(month) ? ['メバル・カレイ'] : []), ...(month >= 9 && month <= 11 ? ['カマス'] : [])];
  return `福岡沿岸の季節の目安：${fish.join('・')}。新宮漁港の岸釣り例を参考にした一般情報で、この港での実績や釣りの許可を示すものではありません。`;
}
function currentWeather(code) {
  if (code === 0) return '快晴';
  if ([1, 2, 3].includes(code)) return '晴れ・くもり';
  if ([45, 48].includes(code)) return '霧';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '雨';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '雪';
  if ([95, 96, 99].includes(code)) return '雷雨';
  return '不明';
}
function direction(degrees) {
  return ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'][Math.round(degrees / 22.5) % 16];
}
async function loadWeather(port, id) {
  const target = $('#weather');
  try {
    const query = new URLSearchParams({ latitude: port.lat, longitude: port.lng, current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m', wind_speed_unit: 'ms', timezone: 'Asia/Tokyo' });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const c = data.current;
    if (!c || !['temperature_2m', 'weather_code', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'].every(k => Number.isFinite(c[k]))) throw new Error('データが不完全です');
    if (id !== requestId) return;
    target.innerHTML = `<div class="weather-grid"><div><small>天気</small><strong>${currentWeather(c.weather_code)}</strong></div><div><small>気温</small><strong>${c.temperature_2m}°C</strong></div><div><small>風速</small><strong>${c.wind_speed_10m} m/s</strong></div><div><small>風向</small><strong>${direction(c.wind_direction_10m)} <em>${c.wind_direction_10m}°</em></strong></div><div><small>瞬間風速</small><strong>${c.wind_gusts_10m} m/s</strong></div></div><p class="caption">予報モデルの現在値・風向は吹いてくる方向<br>${escapeHtml(c.time.replace('T', ' '))} 日本時間 / <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a></p>`;
  } catch (error) {
    if (id === requestId) target.textContent = `天気を取得できませんでした（${error.name === 'TimeoutError' ? '通信がタイムアウトしました' : error.message}）。`;
  }
}
function tideChart(values) {
  const min = Math.min(...values), max = Math.max(...values), span = Math.max(1, max - min);
  const points = values.map((v, i) => `${30 + i * 10},${110 - (v - min) / span * 85}`).join(' ');
  return `<svg viewBox="0 0 280 140" role="img" aria-label="0時から23時までの毎時潮位のグラフ"><line x1="30" y1="110" x2="260" y2="110" stroke="#cfddda"/><polyline points="${points}" fill="none" stroke="#168b84" stroke-width="3" stroke-linejoin="round"/><text x="0" y="27">${max}</text><text x="0" y="110">${min}</text><text x="30" y="132">0時</text><text x="140" y="132">12時</text><text x="235" y="132">23時</text></svg>`;
}
async function loadTide(port, id) {
  const target = $('#tide');
  const date = $('#tide-date').value;
  const station = stationFor(port);
  const tideRequest = `${id}:${date}`;
  target.dataset.request = tideRequest;
  target.textContent = '潮位を取得中…';
  try {
    const response = await fetch(`/api/tide?${new URLSearchParams({ station, date })}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    if (id !== requestId || target.dataset.request !== tideRequest) return;
    target.innerHTML = `<p class="caption">気象庁 ${stations[station].name}（漁港から直線約 ${distance(port, stations[station]).toFixed(0)} km）/ 潮位表基準面・cm</p>${tideChart(data.heights)}<p class="caption">毎時の天文潮位予測。実際の潮位や漁港の潮位とは異なります。<br><a href="${escapeHtml(data.source)}" target="_blank" rel="noopener">気象庁の潮位表 ↗</a></p>`;
  } catch (error) {
    if (id === requestId && target.dataset.request === tideRequest) target.textContent = `潮位を取得できませんでした（${error.message}）。`;
  }
}
function selectPort(port, focusMap = true) {
  selected = port;
  const id = ++requestId;
  if (renderer) renderer.set('directions', null);
  renderList();
  if (map && focusMap) { map.panTo({ lat: port.lat, lng: port.lng }); map.setZoom(13); }
  const callout = $('#map-callout');
  callout.hidden = false;
  callout.style.setProperty('--spot-color', areaColors[port.area]);
  callout.innerHTML = `<small>SELECTED SPOT ●</small><strong>${escapeHtml(port.name)}漁港</strong><span>${escapeHtml(port.area)} · 参考位置</span>`;
  const warning = port.name === '沖の島' ? '<p class="warning">沖ノ島は一般上陸が原則禁止されています。釣行先ではありません。</p>' : '';
  $('#details').innerHTML = `<div class="detail-top"><span class="eyebrow">${escapeHtml(port.area)} / FISHING PORT</span><h2>${escapeHtml(port.name)}<span>漁港</span></h2><p class="coordinates">${port.lat.toFixed(5)}° N &nbsp; ${port.lng.toFixed(5)}° E</p>${warning}</div>
    <div class="detail-content">
      <section><div class="section-title"><span>01</span><h3>今の時期の岸釣り</h3></div><p>${fishFor(port)}</p><p class="caption">季節は日本時間の月で判定。船釣りの情報は対象外。<br><a href="${port.area === '有明海' ? 'https://tsurispot.com/area-guide/ariake-sea' : 'https://www.turi-portal.com/teibo/2954'}" target="_blank" rel="noopener">季節の参考情報 ↗</a></p></section>
      <section><div class="section-title"><span>02</span><h3>天気と風</h3></div><div id="weather">天気を取得中…</div></section>
      <section><div class="section-title"><span>03</span><h3>潮位グラフ</h3></div><label class="date-label" for="tide-date">表示日（日本時間）</label><input id="tide-date" type="date" value="${jstDate()}"><div id="tide"></div></section>
      <section><div class="section-title"><span>04</span><h3>ここまでのアクセス</h3></div><p class="caption">位置情報は経路表示のためブラウザと Google Maps に送信されます。離島などは車の経路が見つからない場合があります。</p><button id="route" class="route-button">◎ 現在地からの距離・ルート</button><div id="route-result" class="route-result"></div></section>
      <section class="notice"><strong>釣行前のお願い</strong><p>漁港は漁業のための施設です。立入禁止・釣り禁止区域、漁業権、駐車ルールを管理者や現地で確認してください。潮位・天気は安全を保証しません。</p><a href="https://www.pref.fukuoka.lg.jp/contents/yugyo-rule.html" target="_blank" rel="noopener">福岡県の遊漁情報 ↗</a></section>
      <p class="caption">座標：国土数値情報 漁港データ（1984年、JGD2000）。代表位置であり現在の釣り場や入口を保証しません。<br><a href="https://nlftp.mlit.go.jp/ksj/gmlold/datalist/gmlold_KsjTmplt-C09.html" target="_blank" rel="noopener">座標の出典 ↗</a></p>
    </div>`;
  $('#tide-date').addEventListener('change', () => loadTide(port, id));
  $('#route').addEventListener('click', () => showRoute(port, id));
  loadWeather(port, id);
  loadTide(port, id);
}
function showRoute(port, id) {
  const result = $('#route-result');
  if (!navigator.geolocation) { result.textContent = 'このブラウザは位置情報に対応していません。'; return; }
  result.textContent = '現在地を取得中…';
  navigator.geolocation.getCurrentPosition(position => {
    if (id !== requestId) return;
    locationPoint = { lat: position.coords.latitude, lng: position.coords.longitude };
    const direct = distance(locationPoint, port).toFixed(1);
    result.textContent = `直線距離 約 ${direct} km。車の経路を検索中…`;
    if (!map || !renderer) {
      const link = new URL('https://www.google.com/maps/dir/');
      link.search = new URLSearchParams({ api: '1', origin: `${locationPoint.lat},${locationPoint.lng}`, destination: `${port.lat},${port.lng}`, travelmode: 'driving' });
      result.textContent = `直線距離 約 ${direct} km。アプリ内の車ルート表示には Google Maps の設定が必要です。 `;
      const anchor = document.createElement('a');
      anchor.href = link.href;
      anchor.target = '_blank';
      anchor.rel = 'noopener';
      anchor.textContent = 'Google Maps でルートを開く ↗';
      result.append(anchor);
      return;
    }
    new google.maps.DirectionsService().route({ origin: locationPoint, destination: { lat: port.lat, lng: port.lng }, travelMode: google.maps.TravelMode.DRIVING }, (response, status) => {
      if (id !== requestId) return;
      if (status !== 'OK' || !response?.routes[0]?.legs[0]) {
        result.textContent = `直線距離 約 ${direct} km。車の経路を取得できませんでした（${status}）。離島・通行規制等を確認してください。`;
        return;
      }
      renderer.setDirections(response);
      const leg = response.routes[0].legs[0];
      result.textContent = `直線距離 約 ${direct} km / 車 ${leg.distance.text}・約 ${leg.duration.text}。実際の通行可否を確認してください。`;
    });
  }, error => { if (id === requestId) result.textContent = `現在地を取得できませんでした（${error.message}）。位置情報の許可を確認してください。`; }, { timeout: 15000, maximumAge: 60000 });
}
function showMapMessage(message) { const el = $('#map-message'); el.hidden = false; el.textContent = message; }
function initMap() {
  if (fallbackStarted) return;
  map = new google.maps.Map($('#map'), { center: { lat: 33.62, lng: 130.55 }, zoom: 9, mapTypeControl: false, streetViewControl: false, fullscreenControl: true, styles: [
    { elementType: 'geometry', stylers: [{ color: '#1d2928' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#aab4ae' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#17201f' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#173239' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#394642' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] }
  ] });
  renderer = new google.maps.DirectionsRenderer({ map, suppressMarkers: false });
  markers = ports.map(port => {
    const marker = new google.maps.Marker({ map, position: { lat: port.lat, lng: port.lng }, title: `${port.name}漁港` });
    marker.addListener('click', () => selectPort(port));
    return {
      port,
      setVisible: visible => marker.setVisible(visible),
      setSelected: active => marker.setIcon({ path: google.maps.SymbolPath.CIRCLE, scale: active ? 11 : 7, fillColor: areaColors[port.area], fillOpacity: 0.95, strokeColor: '#f2eee5', strokeWeight: active ? 3 : 2 })
    };
  });
  renderList();
}
function initFallback(reason) {
  if (fallbackStarted) return;
  fallbackStarted = true;
  map = null;
  renderer = null;
  markers = [];
  const oldMap = $('#map');
  const replacement = oldMap.cloneNode(false);
  oldMap.replaceWith(replacement);
  showMapMessage(`${reason} OpenStreetMap の参考地図を表示します。`);
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(css);
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  script.onload = () => {
    const leafletMap = L.map('map', { zoomControl: false }).setView([33.62, 130.55], 9);
    L.control.zoom({ position: 'bottomright' }).addTo(leafletMap);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(leafletMap);
    map = {
      panTo: point => leafletMap.panTo([point.lat, point.lng]),
      setZoom: zoom => leafletMap.setZoom(zoom)
    };
    markers = ports.map(port => {
      const marker = L.circleMarker([port.lat, port.lng], { radius: 7, color: '#f2eee5', weight: 2, fillColor: areaColors[port.area], fillOpacity: 0.95 }).bindTooltip(`${port.name}漁港`);
      marker.on('click', () => selectPort(port));
      marker.addTo(leafletMap);
      return {
        port,
        setVisible: visible => { if (visible && !leafletMap.hasLayer(marker)) marker.addTo(leafletMap); else if (!visible && leafletMap.hasLayer(marker)) leafletMap.removeLayer(marker); },
        setSelected: active => { marker.setRadius(active ? 11 : 7); marker.setStyle({ weight: active ? 3 : 2 }); }
      };
    });
    renderList();
  };
  script.onerror = () => showMapMessage('代替地図も読み込めませんでした。通信環境を確認してください。');
  document.head.appendChild(script);
}
async function start() {
  try {
    const [dataResponse, configResponse] = await Promise.all([fetch('/ports.json'), fetch('/api/config')]);
    if (!dataResponse.ok || !configResponse.ok) throw new Error('設定または漁港データを読み込めません。');
    ports = await dataResponse.json();
    const { mapsKey } = await configResponse.json();
    $('#total-count').textContent = `${ports.length} SPOTS`;
    selectPort(ports.find(port => port.name === '博多') || ports[0], false);
    if (!mapsKey) { initFallback('Google Maps API キーが未設定です。'); return; }
    window.gm_authFailure = () => initFallback('Google Maps の認証に失敗しました。API キー・課金・リファラー制限を確認してください。');
    window.initFishingMap = initMap;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsKey)}&callback=initFishingMap&language=ja&region=JP&loading=async`;
    script.async = true;
    script.onerror = () => initFallback('Google Maps を読み込めませんでした。');
    document.head.appendChild(script);
  } catch (error) { showMapMessage(`初期化に失敗しました：${error.message}`); }
}
$('#search').addEventListener('input', renderList);
$('.area-filter').addEventListener('click', event => {
  const button = event.target.closest('button[data-area]');
  if (!button) return;
  selectedArea = button.dataset.area;
  document.querySelectorAll('.area-filter button').forEach(item => {
    const active = item === button;
    item.classList.toggle('area-active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  renderList();
});
function setSidebar(open) {
  $('#sidebar').classList.toggle('open', open);
  $('#open-list').setAttribute('aria-expanded', String(open));
}
$('#open-list').addEventListener('click', () => setSidebar(true));
$('#close-list').addEventListener('click', () => setSidebar(false));
$('#map-route').addEventListener('click', () => { if (selected) showRoute(selected, requestId); });
$('#port-list').addEventListener('click', event => {
  const button = event.target.closest('button[data-id]');
  const port = button && ports.find(p => p.id === button.dataset.id);
  if (port) { selectPort(port); setSidebar(false); }
});
start();
