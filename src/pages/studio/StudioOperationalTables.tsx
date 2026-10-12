import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ImagePlus, Package, Pencil, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { money } from '@/lib/money';
import OrderActionPanel from './OrderActionPanel';
import { authHeaders } from '@/lib/session';

type Any = Record<string, any>;
type Category = { id: string; name: string; slug: string; icon: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'include', ...init, headers: authHeaders(init?.headers) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `Request failed (${r.status})`);
  return b as T;
}

const field = 'mt-1 w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2.5 text-base text-[var(--admin-text-primary)] outline-none focus:border-vura-400';

export function OperationalOrders({ orders, suppliers, onRefresh }: { orders: Any[]; suppliers: Any[]; onRefresh: () => void }) {
  const [selected, setSelected] = useState<Any | null>(null);
  const [q, setQ] = useState('');
  const rows = useMemo(() => orders.filter(o => `${o.order_number} ${o.delivery_name} ${o.product_name} ${o.buyer_email}`.toLowerCase().includes(q.toLowerCase())), [orders, q]);
  return <section>
    <Toolbar title="Orders" action={<div className="flex gap-2"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search orders…" className={field.replace('mt-1 ','')}/><button onClick={onRefresh} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--admin-border)]"><RefreshCw size={16}/></button></div>}/>
    <div className="overflow-hidden rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)]"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-[var(--admin-border)] text-xs text-[var(--admin-text-muted)]"><tr>{['Order','Customer','Product','Payment','Sourcing','Total',''].map(h => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody>{rows.map(o => <tr key={o.id} onClick={() => setSelected(o)} className="cursor-pointer border-b border-[var(--admin-border)] hover:bg-[var(--admin-input-bg)]"><td className="px-4 py-4 font-bold">{o.order_number}</td><td className="px-4 py-4">{o.delivery_name}<small className="block text-[var(--admin-text-muted)]">{o.delivery_phone}</small></td><td className="px-4 py-4">{o.product_name}<small className="block text-[var(--admin-text-muted)]">Qty {o.quantity}</small></td><td className="px-4 py-4"><Status value={o.payment_status}/></td><td className="px-4 py-4"><Status value={o.sourcing_status || o.status}/></td><td className="px-4 py-4 font-bold">{money(o.total_kobo)}</td><td className="px-4"><ChevronRight size={16} className="text-[var(--admin-text-muted)]"/></td></tr>)}</tbody></table>{!rows.length && <div className="p-8 text-center text-sm text-[var(--admin-text-muted)]">No orders match your search.</div>}</div>
    <OrderActionPanel order={selected} suppliers={suppliers} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); onRefresh(); }}/>
  </section>;
}

export function OperationalProducts({ products, suppliers = [], onRefresh }: { products: Any[]; suppliers?: Any[]; onRefresh: () => void }) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Any | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const rows = useMemo(
    () => products.filter(p => p.is_active !== false && `${p.name} ${p.brand} ${p.category} ${p.supplier_name}`.toLowerCase().includes(q.toLowerCase())),
    [products, q],
  );
  const remove = async (p: Any) => {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone if there are no orders on it.`)) return;
    setDeletingId(p.id);
    try {
      const res = await api<{ deleted?: boolean; deactivated?: boolean; message?: string }>('/api/admin/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: p.id }),
      });
      if (res.deactivated) window.alert(res.message || 'Product was deactivated because it has related orders.');
      onRefresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not delete product.');
    } finally {
      setDeletingId(null);
    }
  };
  return <section>
    <Toolbar title="Products" action={<div className="flex flex-wrap gap-2"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search products…" className={field.replace('mt-1 ','')}/><button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-xl bg-vura-500 px-4 py-2 text-sm font-bold text-white"><Plus size={15}/> Add product</button></div>}/>
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">{rows.map(p => (
      <article key={p.id} className="overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)]">
        <div className="aspect-square bg-[var(--admin-table-row-hover)]">{p.images?.[0] ? <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover"/> : <div className="grid h-full place-items-center text-[var(--admin-text-muted)]"><Package size={22}/></div>}</div>
        <div className="p-2.5">
          <div className="truncate text-sm font-bold leading-snug">{p.name}</div>
          <div className="mt-0.5 truncate text-[11px] text-[var(--admin-text-muted)]">{p.brand || '—'} · {p.category || 'Uncategorised'}</div>
          <div className="mt-2 flex items-center justify-between gap-1">
            <b className="text-sm">{money(p.price_kobo)}</b>
            <Status value={p.stock_status}/>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => setSelected(p)} className="flex items-center justify-center gap-1 rounded-md border border-[var(--admin-border)] py-1.5 text-[11px] font-bold hover:bg-[var(--admin-table-row-hover)]"><Pencil size={11}/> Edit</button>
            <button type="button" disabled={deletingId === p.id} onClick={() => void remove(p)} className="flex items-center justify-center gap-1 rounded-md border border-red-400/30 bg-red-500/10 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"><Trash2 size={11}/>{deletingId === p.id ? '…' : 'Del'}</button>
          </div>
        </div>
      </article>
    ))}</div>
    {!rows.length && <Empty text="No products yet. Tap Add product, upload photos, and publish the first listing."/>}
    {(selected || creating) && <ProductModal product={selected} suppliers={suppliers} onClose={() => { setSelected(null); setCreating(false); }} onSaved={() => { setSelected(null); setCreating(false); onRefresh(); }}/>}
  </section>;
}

/** ── Brand pools by vertical (longest match wins in detectBrand) ── */

const PHONE_BRANDS = [
  'Apple','Samsung','Tecno','Infinix','Itel','Xiaomi','Redmi','Poco','Oppo','Vivo','Huawei','Honor',
  'Nokia','Google','Sony','LG','OnePlus','Realme','Motorola','Nothing','ZTE','Fairphone','Asus',
  'Blackview','Doogee','Cubot','Umidigi','Sharp','Alcatel','Meizu','Coolpad','Gionee','Leagoo',
];

const LAPTOP_BRANDS = [
  'HP','Dell','Lenovo','Asus','Acer','Microsoft','Toshiba','MSI','Razer','Apple','Alienware',
  'Gigabyte','Samsung','Huawei','LG','Framework','System76','Chuwi',
];

const ACCESSORY_BRANDS = [
  'JBL','Oraimo','Anker','Beats','Baseus','Ugreen','Spigen','Belkin','Boat','Sony','Bose','Sennheiser',
  'Logitech','Razer','Corsair','HyperX','Sony WH','Sony WF','Skullcandy','Jabra','Soundcore','Tribit',
  'Remax','Hoco','Yesido','Porodo','Xiaomi','Samsung','Apple','OtterBox','Ringke','ESR','Nomad',
];

const CAMERA_BRANDS = [
  'Canon','Nikon','GoPro','DJI','Fujifilm','Panasonic','Sony','Olympus','Leica','Instax','Polaroid',
  'Blackmagic','Red Digital','Sigma','Tamron','Godox','Manfrotto',
];

const GAMING_BRANDS = [
  'Nintendo','PlayStation','Xbox','Steam Deck','Razer','Logitech','Sony','Microsoft','Valve',
  'Asus ROG','MSI','Alienware','Corsair','SteelSeries','HyperX','Thrustmaster','Mad Catz',
];

const CAR_BRANDS = [
  'Toyota','Honda','Lexus','Mercedes-Benz','Mercedes','BMW','Audi','Volkswagen','VW','Ford','Hyundai',
  'Kia','Nissan','Mazda','Peugeot','Renault','Suzuki','Mitsubishi','Chevrolet','Jeep','Land Rover',
  'Range Rover','Volvo','Porsche','Tesla','BYD','Changan','GAC','Haval','Great Wall','Isuzu',
  'Infiniti','Acura','Cadillac','Jaguar','Mini','Fiat','Skoda','Seat','Opel','Citroën','Citroen',
  'Subaru','Genesis','Rivian','Lucid','MG','Chery','Geely','BAIC','Dongfeng','Foton','Bentley',
  'Rolls-Royce','Ferrari','Lamborghini','Maserati','Alfa Romeo','Aston Martin','Bugatti','McLaren',
  'Dodge','Chrysler','Ram','GMC','Buick','Lincoln','Hummer','Saab','Daewoo','SsangYong','Proton',
  'Tata','Mahindra','Perodua','Dacia','Lada','GAZ','UAZ','Wuling','NIO','XPeng','Li Auto','Zeekr',
];

const MOTORCYCLE_BRANDS = [
  'Yamaha','Honda','Suzuki','Kawasaki','Bajaj','TVS','Hero','Royal Enfield','KTM','Ducati',
  'Harley-Davidson','BMW Motorrad','Triumph','Aprilia','Vespa','Piaggio','CFMoto','Benelli',
  'Innoson','Jincheng','Haojue','Lifan','Qlink','Canny','Skygo','Ashford','Daylong',
];

const PERFUME_BRANDS = [
  'Dior','Chanel','Gucci','Versace','YSL','Yves Saint Laurent','Armani','Tom Ford','Creed','Parfums de Marly',
  'Maison Francis Kurkdjian','Byredo','Le Labo','Jo Malone','Burberry','Prada','Valentino','Givenchy',
  'Hermès','Hermes','Calvin Klein','Hugo Boss','Davidoff','Lattafa','Armaf','Afnan','Rasasi','Ajmal',
  'Al Haramain','Montale','Mancera','Initio','Xerjoff','Amouage','Roja','Kilian','Mugler','Jean Paul Gaultier',
  'Paco Rabanne','Carolina Herrera','Dolce & Gabbana','Ralph Lauren','Bath & Body Works','Victoria\'s Secret',
  'Bvlgari','Bulgari','Cartier','Tiffany','Coach','Marc Jacobs','Viktor & Rolf','Issey Miyake','Kenzo',
  'Lancome','Lancôme','Estée Lauder','Estee Lauder','Clinique','Giorgio Armani','Emporio Armani',
  'Kayali','Ellis Brooklyn','Commodity','Diptyque','Acqua di Parma','Penhaligon\'s','Bond No. 9',
  'Nasomatto','Nishane','Zoologist','Etat Libre d\'Orange','Serge Lutens','Frederic Malle','By Kilian',
  'Swiss Arabian','Nabeel','Ard Al Zaafaran','Paris Corner','French Avenue','Fragrance World','Maison Alhambra',
];

const FASHION_BRANDS = [
  'Nike','Adidas','Puma','New Balance','Reebok','Under Armour','Jordan','Converse','Vans','Crocs',
  'Gucci','Louis Vuitton','Prada','Balenciaga','Zara','H&M','Uniqlo','Shein','Fendi','Burberry',
  'Off-White','Supreme','Stone Island','Moncler','Canada Goose','The North Face','Columbia','Patagonia',
  'Levi\'s','Levis','Tommy Hilfiger','Ralph Lauren','Calvin Klein','Guess','Diesel','Armani Exchange',
  'Lacoste','Fred Perry','Champion','Fila','Asics','Skechers','Timberland','Dr. Martens','Clarks',
  'Birkenstock','UGG','Havaianas','Crocs','Allbirds','On Running','Hoka','Salomon','Merrell',
  'Dior','Chanel','Hermès','Hermes','Yves Saint Laurent','YSL','Versace','Givenchy','Bottega Veneta',
  'Celine','Loewe','Saint Laurent','Alexander McQueen','Stella McCartney','Miu Miu','Valentino',
];

const APPLIANCE_BRANDS = [
  'LG','Samsung','Hisense','Haier','Scanfrost','Polystar','Binatone','Nexus','Maxi','Kenwood',
  'Philips','Bosch','Whirlpool','Panasonic','Sharp','Thermocool','Syinix','Century','Royal',
  'Midea','TCL','Skyworth','Sony','Toshiba','Electrolux','Siemens','Smeg','KitchenAid','Ninja',
  'Dyson','Xiaomi','Huawei','Breville','Cuisinart','Instant Pot','Russell Hobbs','Morphy Richards',
  'Firman','Sumec','Firman','Honda','Yamaha','Lutian','Aima','Elepaq','Kipor','Powerhouse',
];

const BEAUTY_BRANDS = [
  'MAC','Fenty','Maybelline','L\'Oreal','L\'Oréal','Nivea','The Ordinary','CeraVe','Neutrogena','Dove','Vaseline',
  'Shea Moisture','ORS','Cantu','Garnier','Revlon','e.l.f.','NYX','Rare Beauty','Charlotte Tilbury',
  'Huda Beauty','Anastasia Beverly Hills','Too Faced','Urban Decay','NARS','Benefit','Clinique',
  'Estée Lauder','Estee Lauder','Lancome','Lancôme','Olay','Aveeno','Cetaphil','La Roche-Posay',
  'Vichy','Bioderma','Eucerin','Simple','St. Ives','Ponds','Pond\'s','Fair & White','Caro White',
  'Dark & Lovely','SoftSheen','Motions','Design Essentials','Mielle','Camille Rose','Pattern',
];

const FURNITURE_BRANDS = [
  'Ikea','Ashley','Wayfair','West Elm','Pottery Barn','Crate & Barrel','Article','Burrow',
  'Dozy','Swoosh','Sleepwell','Mouka','Vitafoam','Foam & Fibre','Royal Foam',
];

const WATCH_BRANDS = [
  'Rolex','Omega','Patek Philippe','Audemars Piguet','Cartier','Tag Heuer','Seiko','Casio','Citizen',
  'Tissot','Longines','Breitling','Hublot','IWC','Panerai','Vacheron Constantin','Jaeger-LeCoultre',
  'Fossil','Michael Kors','Daniel Wellington','Swatch','G-Shock','Apple','Samsung','Garmin','Fitbit',
  'Huawei','Amazfit','Xiaomi','Withings','Polar','Suunto','Timex','Orient','Hamilton','Bulova',
];

const JEWELRY_BRANDS = [
  'Tiffany','Cartier','Pandora','Swarovski','Pandora','Kay','Zales','Blue Nile','Mejuri','AUrate',
  'Apples of Gold','Sarah and Sebastian','Monica Vinader','Missoma','Maria Black','Ariel Gordon',
];

const BABY_BRANDS = [
  'Pampers','Huggies','Johnson\'s','Johnson and Johnson','Fisher-Price','Lego','Mattel','Hasbro',
  'Chicco','Graco','BabyBjorn','Ergobaby','Medela','Philips Avent','Nuk','Tommee Tippee',
  'CeraVe Baby','Aveeno Baby','Mustela','Sebamed','Molfix','Cussons Baby','Pears Baby',
];

const PET_BRANDS = [
  'Pedigree','Whiskas','Royal Canin','Purina','Hills','Iams','Fancy Feast','Friskies','Blue Buffalo',
  'Kong','PetSafe','Furminator','Seresto','Frontline','Advantage','Nylabone',
];

const SPORTS_BRANDS = [
  'Nike','Adidas','Puma','Under Armour','Reebok','New Balance','Asics','Wilson','Spalding','Yonex',
  'Head','Babolat','Decathlon','Gymshark','Lululemon','Fabletics','Peloton','Bowflex','Yeso',
];

const FOOD_BRANDS = [
  'Nestle','Nestlé','Cadbury','Indomie','Dangote','Peak','Milo','Bournvita','Cowbell','Three Crowns',
  'Kellogg\'s','Kelloggs','Quaker','Maggi','Knorr','Devon King\'s','Power Oil','Mamador','Gino',
  'Coca-Cola','Pepsi','Fanta','Sprite','Red Bull','Monster','Hollandia','Chi','Chi Limited','Rite Foods',
];

const SUPERMARKET_BRANDS = [
  'Dettol','Harpic','Air Wick','Glade','Ariel','Omo','Sunlight','Lux','Lifebuoy','Closeup','Colgate',
  'Sensodyne','Oral-B','Listerine','Always','Kotex','Carefree','Tampax','Gillette','Nivea Men',
];

const KNOWN_BRANDS = Array.from(new Set([
  ...PHONE_BRANDS, ...LAPTOP_BRANDS, ...ACCESSORY_BRANDS, ...CAMERA_BRANDS, ...GAMING_BRANDS,
  ...CAR_BRANDS, ...MOTORCYCLE_BRANDS, ...PERFUME_BRANDS, ...FASHION_BRANDS, ...APPLIANCE_BRANDS,
  ...BEAUTY_BRANDS, ...FURNITURE_BRANDS, ...WATCH_BRANDS, ...JEWELRY_BRANDS, ...BABY_BRANDS,
  ...PET_BRANDS, ...SPORTS_BRANDS, ...FOOD_BRANDS, ...SUPERMARKET_BRANDS,
])).sort((a, b) => b.length - a.length);

/** Popular models — autocomplete pools */
const PHONE_MODELS = [
  'iPhone 11','iPhone 11 Pro','iPhone 11 Pro Max','iPhone 12','iPhone 12 mini','iPhone 12 Pro','iPhone 12 Pro Max',
  'iPhone 13','iPhone 13 mini','iPhone 13 Pro','iPhone 13 Pro Max','iPhone 14','iPhone 14 Plus','iPhone 14 Pro','iPhone 14 Pro Max',
  'iPhone 15','iPhone 15 Plus','iPhone 15 Pro','iPhone 15 Pro Max','iPhone 16','iPhone 16 Plus','iPhone 16 Pro','iPhone 16 Pro Max',
  'iPhone SE (2022)','iPhone XR','iPhone XS','iPhone XS Max',
  'Samsung Galaxy A05','Samsung Galaxy A06','Samsung Galaxy A14','Samsung Galaxy A15','Samsung Galaxy A16',
  'Samsung Galaxy A24','Samsung Galaxy A25','Samsung Galaxy A34','Samsung Galaxy A35','Samsung Galaxy A54','Samsung Galaxy A55',
  'Samsung Galaxy S21','Samsung Galaxy S21 FE','Samsung Galaxy S22','Samsung Galaxy S22 Ultra','Samsung Galaxy S23','Samsung Galaxy S23 Ultra',
  'Samsung Galaxy S24','Samsung Galaxy S24 Ultra','Samsung Galaxy S25','Samsung Galaxy S25 Ultra',
  'Samsung Galaxy Note 20','Samsung Galaxy Note 20 Ultra','Samsung Galaxy Z Flip 5','Samsung Galaxy Z Flip 6','Samsung Galaxy Z Fold 5','Samsung Galaxy Z Fold 6',
  'Tecno Spark 10','Tecno Spark 20','Tecno Spark 20 Pro','Tecno Spark 30','Tecno Camon 20','Tecno Camon 20 Pro','Tecno Camon 30','Tecno Camon 30 Pro','Tecno Phantom X2','Tecno Phantom V Flip',
  'Infinix Hot 30','Infinix Hot 40','Infinix Hot 40 Pro','Infinix Note 30','Infinix Note 40','Infinix Note 40 Pro','Infinix Zero 30','Infinix Smart 8',
  'Itel A70','Itel A60','Itel S23','Itel P55','Itel Vision 5',
  'Redmi 13','Redmi 13C','Redmi 14C','Redmi Note 12','Redmi Note 13','Redmi Note 13 Pro','Redmi Note 14','Poco X6','Poco M6','Poco C65','Xiaomi 14','Xiaomi 14T',
  'Oppo A18','Oppo A38','Oppo A60','Oppo Reno 11','Oppo Reno 12','Vivo Y27','Vivo Y28','Vivo V30','Realme C53','Realme C67','Realme 12','OnePlus Nord CE 3','OnePlus 12',
  'Google Pixel 7','Google Pixel 8','Google Pixel 8a','Google Pixel 9','Nokia G22','Nokia C32','Huawei Nova 12','Honor X8',
];

const WEARABLE_MODELS = [
  'Apple Watch Series 8','Apple Watch Series 9','Apple Watch Series 10','Apple Watch SE','Apple Watch Ultra 2',
  'Samsung Galaxy Watch 6','Samsung Galaxy Watch 7','Samsung Galaxy Watch FE','Samsung Galaxy Buds 2 Pro','Samsung Galaxy Buds FE',
  'Oraimo Watch 4','Oraimo FreePods','JBL Tune Buds','AirPods Pro','AirPods Pro 2','AirPods 3','AirPods 4',
  'Garmin Forerunner 265','Garmin Fenix 7','Fitbit Charge 6','Fitbit Versa 4','Amazfit GTR 4','Huawei Watch GT 4',
];

const CAR_MODELS = [
  'Toyota Corolla','Toyota Camry','Toyota RAV4','Toyota Highlander','Toyota Hilux','Toyota Land Cruiser','Toyota Prado','Toyota Sienna','Toyota Yaris','Toyota Avalon','Toyota Venza','Toyota 4Runner','Toyota Tacoma','Toyota Tundra',
  'Honda Accord','Honda Civic','Honda CR-V','Honda Pilot','Honda HR-V','Honda Odyssey','Honda Ridgeline',
  'Lexus RX 350','Lexus ES 350','Lexus GX 460','Lexus LX 570','Lexus NX 350','Lexus IS 350','Lexus UX 250h',
  'Mercedes-Benz C-Class','Mercedes-Benz E-Class','Mercedes-Benz S-Class','Mercedes-Benz GLE','Mercedes-Benz GLC','Mercedes-Benz G-Wagon','Mercedes-Benz A-Class','Mercedes-Benz CLA',
  'BMW 3 Series','BMW 5 Series','BMW X3','BMW X5','BMW X6','BMW 7 Series','BMW X1','BMW X7',
  'Audi A4','Audi A6','Audi Q5','Audi Q7','Audi A3','Audi Q3','Ford Ranger','Ford Explorer','Ford Edge','Ford F-150','Ford Escape','Ford Mustang',
  'Hyundai Elantra','Hyundai Tucson','Hyundai Santa Fe','Hyundai Sonata','Kia Sportage','Kia Sorento','Kia Rio','Kia Telluride',
  'Nissan Altima','Nissan Pathfinder','Nissan Patrol','Nissan X-Trail','Nissan Rogue','Mazda CX-5','Mazda CX-30','Mazda 3',
  'Peugeot 301','Peugeot 508','Peugeot 3008','Suzuki Swift','Suzuki Vitara','Volkswagen Golf','Volkswagen Tiguan','Volkswagen Passat',
  'Tesla Model 3','Tesla Model Y','Tesla Model S','Tesla Model X','BYD Atto 3','BYD Seal','Changan CS75','Haval H6',
];

const MOTORCYCLE_MODELS = [
  'Yamaha YBR 125','Yamaha FZ','Yamaha MT-07','Yamaha R15','Honda CB125','Honda CBR','Honda Ace 125','Bajaj Boxer','Bajaj Pulsar','TVS Apache','Suzuki Gixxer','Royal Enfield Classic 350','KTM Duke 200','Jincheng AX100',
];

const PERFUME_MODELS = [
  'Dior Sauvage','Dior Homme','Miss Dior','Chanel No. 5','Chanel Bleu de Chanel','Coco Mademoiselle','Chance Chanel',
  'Gucci Bloom','Gucci Guilty','Versace Eros','Versace Dylan Blue','Versace Bright Crystal','YSL Y Eau de Parfum','YSL Black Opium','YSL Libre',
  'Armani Code','Acqua di Gio','Stronger With You','Tom Ford Black Orchid','Tom Ford Oud Wood','Tom Ford Tobacco Vanille','Creed Aventus','Creed Silver Mountain Water',
  'Lattafa Asad','Lattafa Khamrah','Lattafa Qaed Al Fursan','Armaf Club de Nuit Intense','Armaf Club de Nuit Woman','Afnan 9pm','Afnan 9am Dive','Rasasi Hawas','Rasasi Daarej',
  'Jean Paul Gaultier Le Male','Jean Paul Gaultier Scandal','Paco Rabanne 1 Million','Paco Rabanne Invictus','Carolina Herrera Good Girl','Mugler Angel','Mugler Alien',
];

const FASHION_MODELS = [
  'Nike Air Force 1','Nike Dunk Low','Nike Air Max 90','Nike Air Max 97','Nike Cortez','Adidas Ultraboost','Adidas Samba','Adidas Gazelle','Adidas Superstar','Adidas Campus',
  'Jordan 1 Retro High','Jordan 1 Low','Jordan 4 Retro','Jordan 11','New Balance 550','New Balance 9060','New Balance 574','Puma Suede Classic','Puma RS-X','Converse Chuck Taylor','Vans Old Skool',
];

const LAPTOP_MODELS = [
  'MacBook Air M1','MacBook Air M2','MacBook Air M3','MacBook Pro 14','MacBook Pro 16','MacBook Pro M3',
  'HP Pavilion 15','HP EliteBook','HP ProBook','HP Spectre','Dell XPS 13','Dell XPS 15','Dell Inspiron 15','Dell Latitude',
  'Lenovo ThinkPad X1','Lenovo ThinkPad E14','Lenovo IdeaPad 3','Lenovo Yoga','Asus ROG Zephyrus','Asus VivoBook','Asus TUF','Microsoft Surface Laptop 5','Microsoft Surface Pro 9','Acer Aspire 5','Acer Swift',
];

const APPLIANCE_MODELS = [
  'LG Refrigerator','LG Washing Machine','LG Air Conditioner','Samsung Refrigerator','Samsung TV 55','Hisense TV 43','Hisense Refrigerator',
  'Thermocool Generator','Scanfrost Generator','Binatone Blender','Polystar TV','Nexus Standing Fan','Century Ceiling Fan','Dyson V15','Dyson Airwrap',
];

const STORAGE_OPTIONS = ['32GB','64GB','128GB','256GB','512GB','1TB','2TB','4TB'];
const COLOR_OPTIONS = [
  'Black','White','Blue','Green','Gold','Silver','Purple','Pink','Red','Grey','Graphite','Titanium',
  'Beige','Brown','Navy','Orange','Yellow','Cream','Rose Gold','Space Grey','Midnight','Starlight','Ivory',
];

type ProductType =
  | 'phone' | 'wearable' | 'laptop' | 'accessory' | 'car' | 'motorcycle'
  | 'perfume' | 'fashion' | 'appliance' | 'gaming' | 'beauty' | 'furniture'
  | 'watch' | 'jewelry' | 'baby' | 'pet' | 'sports' | 'food' | 'supermarket' | 'camera' | 'other';

function detectBrand(name: string) {
  const n = name.toLowerCase();
  // Product-line / alias shortcuts before generic brand scan
  if (/(iphone|ipad|macbook|airpods|imac|apple watch)/.test(n)) return 'Apple';
  if (n.includes('pixel')) return 'Google';
  if (n.includes('surface')) return 'Microsoft';
  if (n.includes('redmi') || n.includes('poco')) return 'Xiaomi';
  if (n.includes('playstation') || n.includes('ps5') || n.includes('ps4')) return 'PlayStation';
  if (/\bg-wagon\b|\bg class\b|\bg-class\b|\bg63\b/.test(n)) return 'Mercedes-Benz';
  if (n.includes('range rover')) return 'Land Rover';
  if (n.includes('corolla') || n.includes('camry') || n.includes('hilux') || n.includes('prado') || n.includes('highlander') || n.includes('land cruiser')) return 'Toyota';
  if (n.includes('civic') || n.includes('accord') || n.includes('cr-v') || n.includes('crv')) return 'Honda';
  if (n.includes('sauvage') || n.includes('miss dior')) return 'Dior';
  if (n.includes('bleu de chanel') || n.includes('coco mademoiselle')) return 'Chanel';
  if (n.includes('air force 1') || n.includes('air max') || n.includes('dunk low')) return 'Nike';
  if (n.includes('ultraboost') || n.includes('samba') || n.includes('gazelle')) return 'Adidas';
  if (n.includes('jordan ')) return 'Jordan';
  if (n.includes('club de nuit')) return 'Armaf';
  if (n.includes('g-shock')) return 'Casio';
  // Longest brand name wins (KNOWN_BRANDS pre-sorted by length desc)
  for (const brand of KNOWN_BRANDS) {
    if (n.includes(brand.toLowerCase())) return brand;
  }
  return '';
}

function detectProductType(name: string, categoryName: string): ProductType {
  const n = `${name} ${categoryName}`.toLowerCase();
  // Devices
  if (/(phone|iphone|galaxy a|galaxy s|tecno|infinix|itel|redmi|pixel|smartphone|android)/.test(n)) return 'phone';
  if (/(watch|buds|airpods|earbud|wearable|band|headset|fitbit|garmin)/.test(n)) return 'wearable';
  if (/(laptop|macbook|notebook|chromebook|surface)/.test(n)) return 'laptop';
  if (/(accessory|charger|cable|case|power bank|oraimo|cover|earphone)/.test(n)) return 'accessory';
  if (/(camera|lens|gopro|dslr|mirrorless|drone)/.test(n)) return 'camera';
  if (/(ps5|ps4|xbox|nintendo|switch|steam deck|gaming console|controller)/.test(n)) return 'gaming';
  // Vehicles
  if (/(motorcycle|motorbike|scooter|okada|bajaj|Boxer|yamaha ybr|duke |cbr|gixxer)/.test(n)) return 'motorcycle';
  if (/(car|suv|sedan|truck|pickup|corolla|camry|hilux|prado|civic|accord|bmw|mercedes|toyota|honda|lexus|ford|hyundai|nissan|mazda|peugeot|tesla|g-wagon|range rover|vehicle|automobile)/.test(n)) return 'car';
  // Lifestyle
  if (/(perfume|fragrance|eau de|edp|edt|cologne|parfum|sauvage|lattafa|armaf|afnan|rasasi)/.test(n)) return 'perfume';
  if (/(shoe|sneaker|hoodie|jean|dress|apparel|fashion|nike|adidas|jordan|puma|shirt|trouser|bag|handbag)/.test(n)) return 'fashion';
  if (/(fridge|freezer|washer|generator|microwave|tv\b|television|air condition|ac unit|inverter|appliance|blender|fan\b|cooker)/.test(n)) return 'appliance';
  if (/(serum|moisturizer|lipstick|foundation|skincare|makeup|beauty|lotion|cream|soap|shampoo)/.test(n)) return 'beauty';
  if (/(sofa|bed|mattress|furniture|table|chair|wardrobe|cupboard)/.test(n)) return 'furniture';
  if (/(rolex|omega|patek|casio|g-shock|wristwatch|\bwatch\b)/.test(n) && !/(apple watch|galaxy watch|smart ?watch)/.test(n)) return 'watch';
  if (/(jewel|necklace|bracelet|earring|ring\b|gold chain|diamond)/.test(n)) return 'jewelry';
  if (/(baby|diaper|pampers|stroller|crib|infant|toddler)/.test(n)) return 'baby';
  if (/(pet|dog food|cat food|puppy|kitten|pedigree|whiskas)/.test(n)) return 'pet';
  if (/(gym|football|basketball|tennis|sport|dumbbell|treadmill)/.test(n)) return 'sports';
  if (/(indomie|milo|bournvita|snack|beverage|food|grocery|rice|oil|noodles)/.test(n)) return 'food';
  if (/(detergent|bleach|tissue|toothpaste|disinfectant|cleaner)/.test(n)) return 'supermarket';
  if (categoryName) {
    const c = categoryName.toLowerCase();
    if (c.includes('phone') || c.includes('mobile')) return 'phone';
    if (c.includes('wear') || c.includes('audio')) return 'wearable';
    if (c.includes('laptop') || c.includes('computer')) return 'laptop';
    if (c.includes('accessor')) return 'accessory';
    if (c.includes('camera') || c.includes('photo')) return 'camera';
    if (c.includes('game') || c.includes('console')) return 'gaming';
    if (c.includes('motor') || c.includes('bike')) return 'motorcycle';
    if (c.includes('car') || c.includes('vehicle') || c.includes('auto')) return 'car';
    if (c.includes('perfume') || c.includes('fragrance') || c.includes('scent')) return 'perfume';
    if (c.includes('fashion') || c.includes('cloth') || c.includes('shoe') || c.includes('apparel')) return 'fashion';
    if (c.includes('appliance') || c.includes('electronics') || c.includes('home')) return 'appliance';
    if (c.includes('beauty') || c.includes('cosmetic') || c.includes('skincare')) return 'beauty';
    if (c.includes('furniture') || c.includes('furnish')) return 'furniture';
    if (c.includes('watch') || c.includes('timepiece')) return 'watch';
    if (c.includes('jewel')) return 'jewelry';
    if (c.includes('baby') || c.includes('kids') || c.includes('children')) return 'baby';
    if (c.includes('pet') || c.includes('animal')) return 'pet';
    if (c.includes('sport') || c.includes('fitness')) return 'sports';
    if (c.includes('food') || c.includes('grocery') || c.includes('drink')) return 'food';
    if (c.includes('supermarket') || c.includes('household')) return 'supermarket';
  }
  return 'other';
}

function modelSuggestions(query: string, type: ProductType): string[] {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase();
  const poolByType: Partial<Record<ProductType, string[]>> = {
    phone: PHONE_MODELS,
    wearable: WEARABLE_MODELS,
    laptop: LAPTOP_MODELS,
    car: CAR_MODELS,
    motorcycle: MOTORCYCLE_MODELS,
    perfume: PERFUME_MODELS,
    fashion: FASHION_MODELS,
    appliance: APPLIANCE_MODELS,
  };
  const pool = poolByType[type] || [
    ...PHONE_MODELS, ...WEARABLE_MODELS, ...LAPTOP_MODELS,
    ...CAR_MODELS, ...MOTORCYCLE_MODELS, ...PERFUME_MODELS,
    ...FASHION_MODELS, ...APPLIANCE_MODELS,
  ];
  return pool.filter(m => m.toLowerCase().includes(q)).slice(0, 10);
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-6 rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold text-[var(--admin-text-secondary)]">{title}</div>
        {hint && <p className="mt-0.5 text-xs text-[var(--admin-text-muted)]">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function ProductModal({ product, suppliers: _suppliers, onClose, onSaved }: { product: Any | null; suppliers: Any[]; onClose: () => void; onSaved: () => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [brandTouched, setBrandTouched] = useState(Boolean(product?.brand));
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [images, setImages] = useState<string[]>(Array.isArray(product?.images) ? product.images.filter(Boolean) : []);
  const [form, setForm] = useState({
    name: product?.name || '',
    brand: product?.brand || '',
    description: product?.description || '',
    price: product ? String(Number(product.price_kobo) / 100) : '',
    condition: product?.condition_label || 'New',
    storage: product?.storage || '',
    color: product?.color || '',
    stock: product?.stock_status || 'available',
    categoryId: product?.category_id || '',
    active: product?.is_active !== false,
  });
  useEffect(() => {
    void api<{ categories: Category[] }>('/api/admin/categories')
      .then(x => setCategories(x.categories || []))
      .catch(() => undefined);
  }, []);
  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));
  const categoryName = categories.find(c => c.id === form.categoryId)?.name || '';
  const productType = detectProductType(form.name, categoryName);
  const suggestions = modelSuggestions(form.name, productType);
  const showStorage = productType === 'phone' || productType === 'laptop';

  const onName = (value: string) => {
    setShowSuggestions(true);
    setForm(f => {
      const next = { ...f, name: value };
      if (!brandTouched) {
        const guessed = detectBrand(value);
        if (guessed) next.brand = guessed;
      }
      return next;
    });
  };

  const pickSuggestion = (model: string) => {
    setShowSuggestions(false);
    setForm(f => {
      const next = { ...f, name: model };
      if (!brandTouched) {
        const guessed = detectBrand(model);
        if (guessed) next.brand = guessed;
      }
      return next;
    });
  };

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, 8 - images.length);
    if (!list.length) return;
    setUploading(true); setError('');
    try {
      const urls: string[] = [];
      for (const file of list) urls.push(await uploadToCloudinary(file));
      setImages(prev => [...prev, ...urls].slice(0, 8));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload photos.');
    } finally { setUploading(false); }
  };

  const createCategory = async () => {
    if (newCategory.trim().length < 2) return;
    setAddingCategory(true); setError('');
    try {
      const res = await api<{ category: Category }>('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategory.trim() }),
      });
      setCategories(prev => [...prev, res.category].sort((a, b) => a.name.localeCompare(b.name)));
      set('categoryId', res.category.id);
      setNewCategory('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create category.');
    } finally { setAddingCategory(false); }
  };

  const save = async () => {
    setBusy(true); setError('');
    try {
      if (!form.name.trim() || !form.brand.trim() || Number(form.price) <= 0) {
        throw new Error('Name, brand and a valid price are required.');
      }
      if (images.length < 1) throw new Error('Add at least one product photo so buyers can see what they are getting.');
      const payload: Any = {
        name: form.name,
        brand: form.brand,
        description: form.description,
        priceKobo: Math.round(Number(form.price) * 100),
        sourcePriceKobo: null,
        conditionLabel: form.condition,
        storage: showStorage ? (form.storage || null) : null,
        color: form.color || null,
        stockStatus: form.stock,
        categoryId: form.categoryId || null,
        supplierId: null,
        sourceLocation: null,
        isActive: form.active,
        images,
      };
      if (product) {
        await api('/api/admin/products', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: product.id, ...payload }),
        });
      } else {
        await api('/api/admin/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save product.');
    } finally { setBusy(false); }
  };

  const typeLabel =
    productType === 'phone' ? 'Phone specs' :
    productType === 'wearable' ? 'Wearable specs' :
    productType === 'laptop' ? 'Laptop specs' :
    productType === 'accessory' ? 'Accessory details' :
    productType === 'car' ? 'Vehicle details' :
    productType === 'motorcycle' ? 'Motorcycle details' :
    productType === 'perfume' ? 'Fragrance details' :
    productType === 'fashion' ? 'Fashion details' :
    productType === 'appliance' ? 'Appliance details' :
    productType === 'gaming' ? 'Gaming details' :
    productType === 'beauty' ? 'Beauty details' :
    productType === 'furniture' ? 'Furniture details' :
    productType === 'watch' ? 'Watch details' :
    productType === 'jewelry' ? 'Jewelry details' :
    productType === 'baby' ? 'Baby & kids' :
    productType === 'pet' ? 'Pet products' :
    productType === 'sports' ? 'Sports & fitness' :
    productType === 'food' ? 'Food & drinks' :
    productType === 'supermarket' ? 'Household' :
    productType === 'camera' ? 'Camera details' : 'Product details';

  return (
    <Modal title={product ? 'Edit product' : 'Add product'} onClose={onClose}>
      <Section title="Photos" hint="Upload 4–8 clear photos. First photo is the cover.">
        <div className="flex items-center justify-end"><span className="text-xs text-[var(--admin-text-muted)]">{images.length}/8</span></div>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((url, i) => (
            <div key={url} className="relative overflow-hidden rounded-xl border border-[var(--admin-border)] bg-black/20">
              <img src={url} alt={`Product ${i + 1}`} className="aspect-square w-full object-cover" />
              {i === 0 && <span className="absolute left-2 top-2 rounded-full bg-vura-500 px-2 py-0.5 text-[10px] font-bold">Cover</span>}
              <button type="button" onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/70"><Trash2 size={13}/></button>
            </div>
          ))}
          {images.length < 8 && (
            <label className="grid aspect-square cursor-pointer place-items-center rounded-xl border border-dashed border-[var(--admin-border)] bg-[var(--admin-card-bg)] text-center text-xs text-[var(--admin-text-muted)] hover:border-vura-400 hover:text-[var(--admin-text-primary)]">
              <input type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
              <span className="px-2">{uploading ? 'Uploading…' : <><ImagePlus className="mx-auto mb-1" size={18}/> Add photos</>}</span>
            </label>
          )}
        </div>
      </Section>

      <Section title="Basics" hint={productType !== 'other' ? `Detected as ${productType}` : 'Name auto-suggests popular models'}>
        <div className="grid gap-4 md:grid-cols-2">
          <Label text="Product name">
            <div className="relative">
              <input
                value={form.name}
                onChange={e => onName(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
                placeholder="e.g. Samsung Galaxy A16"
                className={field}
                autoComplete="off"
              />
              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-[var(--admin-border)] bg-[#12141f] py-1 shadow-xl">
                  {suggestions.map(m => (
                    <li key={m}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm text-[var(--admin-text-primary)] hover:bg-[var(--admin-table-row-hover)]"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => pickSuggestion(m)}
                      >
                        {m}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Label>
          <Label text="Brand">
            <div className="relative">
              <input
                value={form.brand}
                onChange={e => { setBrandTouched(true); set('brand', e.target.value); }}
                placeholder="Auto-detected from name"
                className={field}
              />
              {!brandTouched && form.brand && <Sparkles size={14} className="absolute right-3 top-4 text-vura-300"/>}
            </div>
          </Label>
          <Label text="Category">
            <select value={form.categoryId} onChange={e => set('categoryId', e.target.value)} className={field}>
              <option value="">Uncategorised</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="mt-2 flex gap-2">
              <input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="New category name" className={field.replace('mt-1 ', '')}/>
              <button type="button" disabled={addingCategory || newCategory.trim().length < 2} onClick={() => void createCategory()} className="shrink-0 rounded-xl border border-[var(--admin-border)] px-3 text-xs font-bold disabled:opacity-40">{addingCategory ? '…' : 'Add'}</button>
            </div>
          </Label>
          <Label text="Stock status">
            <select value={form.stock} onChange={e => set('stock', e.target.value)} className={field}>
              <option value="available">Available</option>
              <option value="low_stock">Low stock</option>
              <option value="out_of_stock">Out of stock</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </Label>
        </div>
      </Section>

      <Section title="Pricing" hint="Selling price in naira">
        <div className="grid gap-4 md:grid-cols-2">
          <Label text="Selling price (₦)">
            <input type="number" min="1" inputMode="numeric" value={form.price} onChange={e => set('price', e.target.value)} placeholder="e.g. 185000" className={field}/>
          </Label>
          <label className="flex items-end gap-3 pb-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} />
            Active on storefront
          </label>
        </div>
      </Section>

      <Section title={typeLabel} hint="Fields adapt to phones, wearables, laptops, or accessories">
        <div className="grid gap-4 md:grid-cols-2">
          {showStorage && (
            <Label text="Storage">
              <input
                list="storage-options"
                value={form.storage}
                onChange={e => set('storage', e.target.value)}
                placeholder="e.g. 256GB"
                className={field}
              />
              <datalist id="storage-options">{STORAGE_OPTIONS.map(s => <option key={s} value={s} />)}</datalist>
            </Label>
          )}
          <Label text="Color">
            <input
              list="color-options"
              value={form.color}
              onChange={e => set('color', e.target.value)}
              placeholder="e.g. Black"
              className={field}
            />
            <datalist id="color-options">{COLOR_OPTIONS.map(c => <option key={c} value={c} />)}</datalist>
          </Label>
          <Label text="Condition">
            <select value={form.condition} onChange={e => set('condition', e.target.value)} className={field}>
              <option>New</option>
              <option>Open box</option>
              <option>Used - like new</option>
              <option>Used - good</option>
              <option>Refurbished</option>
            </select>
          </Label>
          <Label text="Description">
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} placeholder="What the buyer should know." className={field}/>
          </Label>
        </div>
      </Section>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t border-[var(--admin-border)] bg-[var(--admin-sidebar-bg)]/px-1 py-3">
        <button type="button" onClick={onClose} className="rounded-xl border border-[var(--admin-border)] px-4 py-2 text-sm">Cancel</button>
        <button type="button" disabled={busy || uploading} onClick={() => void save()} className="rounded-xl bg-vura-500 px-5 py-2 text-sm font-bold disabled:opacity-50">
          {busy ? 'Saving…' : product ? 'Save changes' : 'Create product'}
        </button>
      </div>
    </Modal>
  );
}

export function OperationalSuppliers({ suppliers, onRefresh }: { suppliers: Any[]; onRefresh: () => void }) {
  const [selected, setSelected] = useState<Any | null>(null); const [creating, setCreating] = useState(false);
  return <section><Toolbar title="Suppliers" action={<button onClick={()=>setCreating(true)} className="flex items-center gap-2 rounded-xl bg-vura-500 px-4 py-2 text-sm font-bold text-white"><Plus size={15}/> Add supplier</button>}/><div className="overflow-hidden rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)]"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b border-[var(--admin-border)] text-xs text-[var(--admin-text-muted)]"><tr>{['Supplier','Location','Phone','Reliability',''].map(h=><th className="px-4 py-3" key={h}>{h}</th>)}</tr></thead><tbody>{suppliers.map(s=><tr key={s.id} className="border-b border-[var(--admin-border)]"><td className="px-4 py-4 font-bold">{s.name}</td><td className="px-4">{s.location||'—'}</td><td className="px-4">{s.phone||'—'}</td><td className="px-4">{s.reliability_score==null?'—':`${s.reliability_score}/5`}</td><td className="px-4"><button onClick={()=>setSelected(s)} className="text-[var(--admin-text-muted)] hover:text-[var(--admin-text-primary)]"><Pencil size={15}/></button></td></tr>)}</tbody></table></div>{(selected||creating)&&<SupplierModal supplier={selected} onClose={()=>{setSelected(null);setCreating(false)}} onSaved={()=>{setSelected(null);setCreating(false);onRefresh()}}/>}</section>;
}

function SupplierModal({ supplier, onClose, onSaved }: { supplier: Any|null; onClose:()=>void; onSaved:()=>void }) {
  const [form,setForm]=useState({name:supplier?.name||'',location:supplier?.location||'',phone:supplier?.phone||'',notes:supplier?.notes||'',score:supplier?.reliability_score==null?'':String(supplier.reliability_score)}); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const set=(k:string,v:string)=>setForm(f=>({...f,[k]:v}));
  const save=async()=>{setBusy(true);setError('');try{if(form.name.trim().length<2)throw new Error('Supplier name is required.');const body:Any={name:form.name,location:form.location,phone:form.phone,notes:form.notes,reliabilityScore:form.score};await api('/api/admin/suppliers',{method:supplier?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(supplier?{supplierId:supplier.id,...body}:body)});onSaved()}catch(e){setError(e instanceof Error?e.message:'Could not save supplier.')}finally{setBusy(false)}};
  return <Modal title={supplier?'Edit supplier':'Add supplier'} onClose={onClose}><div className="space-y-4"><Label text="Name"><input value={form.name} onChange={e=>set('name',e.target.value)} className={field}/></Label><Label text="Location"><input value={form.location} onChange={e=>set('location',e.target.value)} className={field}/></Label><Label text="Phone"><input value={form.phone} onChange={e=>set('phone',e.target.value)} className={field}/></Label><Label text="Reliability score (0–5)"><input type="number" min="0" max="5" step="0.1" value={form.score} onChange={e=>set('score',e.target.value)} className={field}/></Label><Label text="Notes"><textarea rows={4} value={form.notes} onChange={e=>set('notes',e.target.value)} className={field}/></Label></div>{error&&<div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}<div className="mt-6 flex justify-end gap-2"><button onClick={onClose} className="rounded-xl border border-[var(--admin-border)] px-4 py-2 text-sm">Cancel</button><button disabled={busy} onClick={()=>void save()} className="rounded-xl bg-vura-500 px-5 py-2 text-sm font-bold disabled:opacity-50">{busy?'Saving…':'Save supplier'}</button></div></Modal>;
}

function Toolbar({ title, action }: { title: string; action?: ReactNode }) { return <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-black tracking-tight">{title}</h2><p className="mt-1 text-sm text-[var(--admin-text-muted)]">Real operational data. Changes are server-authorized and audited.</p></div>{action}</div>; }
function Label({text,children}:{text:string;children:ReactNode}){return <label className="block text-sm font-semibold text-[var(--admin-text-secondary)]">{text}{children}</label>}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm md:items-center md:p-6"><div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-5 shadow-2xl text-[var(--admin-text-primary)] md:rounded-3xl md:p-6"><div className="flex items-center justify-between"><h3 className="text-xl font-black">{title}</h3><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--admin-border)]"><X size={16}/></button></div><div className="mt-6">{children}</div></div></div>}
function Status({ value }: { value: string }) { return <span className="rounded-full border border-[var(--admin-border)] bg-[var(--admin-table-row-hover)] px-2.5 py-1 text-[11px] font-bold capitalize text-[var(--admin-text-secondary)]">{String(value||'—').replaceAll('_',' ')}</span>; }
function Empty({ text }: { text: string }) { return <div className="py-16 text-center text-sm text-[var(--admin-text-muted)]"><Package className="mx-auto mb-2" size={28}/>{text}</div>; }
