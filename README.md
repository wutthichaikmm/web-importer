# Web Importer

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

เครื่องมือ local สำหรับดึงตอนนิยายจากหน้าสารบัญของเว็บไซต์ ผ่าน [FlareSolverr](https://github.com/FlareSolverr/FlareSolverr) (ผ่านหน้าตรวจสอบของ Cloudflare) แล้วรวมตอนที่ดึงสำเร็จเป็นไฟล์ข้อความ UTF-8 ไฟล์เดียว ดาวน์โหลดหรือคัดลอกไปวางได้ นอกจากนี้ยังมีเครื่องมือจัดรูปแบบและตัดช่วงตอนจากไฟล์ `.txt` ที่มีอยู่แล้ว

*English summary: a local web tool that fetches chapter lists and chapter text through FlareSolverr, merges the chapters you pick into one UTF-8 text file (download or copy), and formats/cuts ranges from existing `.txt` files. Everything runs on your machine, the server only listens on `127.0.0.1`.*

## สารบัญ

- [ความสามารถ](#ความสามารถ)
- [ติดตั้ง](#ติดตั้ง)
- [วิธีใช้งาน](#วิธีใช้งาน)
- [ตั้งค่า](#ตั้งค่า)
- [สำหรับนักพัฒนา](#สำหรับนักพัฒนา)
- [ข้อควรรู้และข้อจำกัด](#ข้อควรรู้และข้อจำกัด)
- [ใบอนุญาตและเครดิต](#ใบอนุญาตและเครดิต)

## ความสามารถ

- ดึงรายการตอนจากหน้าสารบัญ (ตรวจหารายการตอนให้อัตโนมัติจากโครงสร้างเว็บที่พบบ่อย)
- เลือกตอนด้วยการคลิก, Shift + คลิก, หรือพิมพ์ช่วงเลขตอน เช่น 101–200
- ดึงหลายตอนพร้อมกัน ปรับความหน่วงและจำนวนที่ดึงพร้อมกันได้ ความเร็วคงที่แม้ดึงหลายร้อยตอน
- หยุดกลางทางได้ และกดลองดึงเฉพาะตอนที่ล้มเหลวหรือถูกหยุดใหม่ โดยตอนที่สำเร็จแล้วไม่หาย
- ส่งออกเป็นไฟล์ `.txt` หรือคัดลอกข้อความไปวาง ลบชื่อตอนซ้ำในเนื้อหาให้อัตโนมัติ
- แท็บจัดการไฟล์ `.txt`: จัดรูปแบบหัวตอน และตัดเป็นช่วง รองรับ UTF-8, GB18030, GBK และ Big5 ทำงานในเบราว์เซอร์ ไฟล์ไม่ถูกอัปโหลดไปไหน

## ติดตั้ง

เลือกวิธีใดวิธีหนึ่ง ทุกวิธีต้องมี FlareSolverr (วิธีที่ 1 แนบมาให้แล้ว และวิธีที่ 2 แบบรวมเปิดให้ในคำสั่งเดียว)

| ระบบของคุณ | แนะนำ |
|---|---|
| Windows | วิธีที่ 1 (ตัวติดตั้ง) |
| macOS | [ผู้ใช้ macOS](#ผู้ใช้-macos) (วิธีที่ 2 ด้วย Docker) |
| Linux | วิธีที่ 2 (Docker) หรือวิธีที่ 3 (Node.js) |

### วิธีที่ 1: ตัวติดตั้ง Windows (ง่ายที่สุด ไม่ต้องติดตั้งอะไรเพิ่ม)

ได้ `WebImporter-Setup.exe` ไฟล์เดียว (ราว 290 MB) ที่รวม Web Importer กับ FlareSolverr (และ Chrome ของมัน) ติดตั้งเฉพาะผู้ใช้ปัจจุบัน ไม่ต้องใช้สิทธิ์ admin และเลือกสร้าง shortcut บน Desktop ได้

**ดาวน์โหลด:** [`WebImporter-Setup.exe` จากหน้า Releases](https://github.com/wutthichaikmm/web-importer/releases/latest) (ไฟล์ไม่ได้เซ็นชื่อดิจิทัล หากไม่มั่นใจ ตรวจ SHA-256 ที่ระบุไว้ในหน้า Release หรือสร้างเองจากซอร์ส)

**หรือสร้างตัวติดตั้งเอง** ต้องใช้ Windows 10/11 (64 บิต), [Node.js](https://nodejs.org/) 20.12 ขึ้นไป (แนะนำ 24), [Git](https://git-scm.com/) และ [Inno Setup](https://jrsoftware.org/isinfo.php) 6 หรือ 7

```powershell
git clone https://github.com/wutthichaikmm/web-importer.git
cd web-importer
npm install
npm run build:installer
```

สคริปต์จะดาวน์โหลด FlareSolverr v3.5.2 (ตรวจ checksum), สร้าง `WebImporter.exe` แล้วสร้างตัวติดตั้งที่ `dist\installer\WebImporter-Setup.exe` ถ้า Inno Setup อยู่ที่อื่น ให้ตั้งตัวแปร `INNO_SETUP_COMPILER` เป็น path ของ `ISCC.exe`

**ติดตั้งและใช้งาน**

1. รัน `WebImporter-Setup.exe` แล้วทำตามขั้นตอน ถ้า Windows ขึ้น "Windows protected your PC" (เพราะไฟล์ไม่ได้เซ็นชื่อดิจิทัล) ให้กด `More info` → `Run anyway`
2. ดับเบิลคลิก shortcut `Web Importer` โปรแกรมจะเปิด FlareSolverr ให้เอง (ครั้งแรกอาจใช้เวลาสักครู่) แล้วเปิดหน้าเว็บในเบราว์เซอร์
3. ใช้เสร็จแล้วให้ปิดหน้าต่างสีดำของโปรแกรม FlareSolverr ที่เปิดไว้จะปิดตาม ถ้ามีตัวค้างจากครั้งก่อน โปรแกรมจะปิดให้เองตอนเปิดครั้งต่อไป
4. ถ้ามี FlareSolverr เปิดอยู่แล้วที่พอร์ต `8191` (เช่นจาก Docker) โปรแกรมจะใช้ตัวนั้นแทน

ถอนการติดตั้งได้ที่ Settings → Apps

### วิธีที่ 2: Docker

ต้องมี [Docker](https://www.docker.com/) (ใช้ได้บน Windows, macOS และ Linux)

**แบบรวม (แนะนำ)** คำสั่งเดียวเปิดทั้ง Web Importer และ FlareSolverr ให้:

```bash
git clone https://github.com/wutthichaikmm/web-importer.git
cd web-importer
docker compose -f compose.all-in-one.yaml up -d --build
```

เปิด <http://127.0.0.1:8787> (ถ้าพอร์ตนี้ถูกใช้อยู่ ให้ตั้งตัวแปร `WEB_IMPORTER_PORT` เป็นพอร์ตอื่น เช่น `WEB_IMPORTER_PORT=8890 docker compose -f compose.all-in-one.yaml up -d --build`) FlareSolverr ใช้ภายใน network ของ Docker ไม่เปิดพอร์ตออกมา จึงไม่ชนกับ FlareSolverr ที่คุณอาจเปิดไว้ที่ `8191`

- ดู log: `docker compose -f compose.all-in-one.yaml logs -f`
- หยุด: `docker compose -f compose.all-in-one.yaml down`
- อัปเดตโค้ด: `git pull` แล้วรันคำสั่ง `up -d --build` ซ้ำ

**แบบใช้ FlareSolverr ที่มีอยู่แล้ว** ถ้าคุณมี FlareSolverr ทำงานที่พอร์ต `8191` อยู่แล้ว (หรือจะเปิดเองด้วย `docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest`) ให้ใช้ `compose.yaml` ซึ่งเชื่อมผ่าน `http://host.docker.internal:8191`:

```bash
docker compose up -d --build
```

### วิธีที่ 3: Node.js

ต้องมี [Node.js](https://nodejs.org/) 20 ขึ้นไป และ FlareSolverr ที่ทำงานอยู่ที่พอร์ต `8191` (เปิดด้วยคำสั่ง `docker run` ข้างบน หรือใช้ [ไฟล์ปฏิบัติการของ FlareSolverr](https://github.com/FlareSolverr/FlareSolverr/releases))

```bash
git clone https://github.com/wutthichaikmm/web-importer.git
cd web-importer
npm install
npm start
```

เปิด <http://127.0.0.1:8787>

### ผู้ใช้ macOS

FlareSolverr ไม่มีตัวสำเร็จรูปสำหรับ Mac (ทางโปรเจกต์ของเขาให้ไฟล์เฉพาะ Windows และ Linux) ทางที่ง่ายและน่าเชื่อถือที่สุดคือรันผ่าน Docker ซึ่งอิมเมจของทั้ง FlareSolverr และ Web Importer รองรับทั้ง Mac ชิป Apple Silicon (M1–M4) และ Intel ไม่ต้องติดตั้ง Python, Chrome หรือ XQuartz

1. ติดตั้ง [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/) (หรือ [OrbStack](https://orbstack.dev/), [Colima](https://github.com/abiosoft/colima)) แล้วเปิดโปรแกรมทิ้งไว้จนสถานะเป็น "running"
2. ติดตั้ง Git ถ้ายังไม่มี รัน `xcode-select --install` ในเทอร์มินัลจะได้ Git มาด้วย
3. เปิดเทอร์มินัลแล้วรัน:

   ```bash
   git clone https://github.com/wutthichaikmm/web-importer.git
   cd web-importer
   docker compose -f compose.all-in-one.yaml up -d --build
   open http://127.0.0.1:8787
   ```

   ครั้งแรกต้องดาวน์โหลดอิมเมจและสร้างตัวโปรแกรม ใช้เวลาสักครู่
4. ใช้งานตามหัวข้อ [วิธีใช้งาน](#วิธีใช้งาน) ได้เลย
5. เลิกใช้: `docker compose -f compose.all-in-one.yaml down` (ตัวอย่างสั่งจากโฟลเดอร์ `web-importer`) และถ้าตั้ง Docker Desktop ให้เปิดตอนเข้าเครื่อง คอนเทนเนอร์จะเริ่มเองตามที่ตั้ง `restart: unless-stopped` ไว้

**ถ้าไม่อยากสร้างตัวโปรแกรมใน Docker** ใช้ Node.js สำหรับ Web Importer และ Docker เฉพาะ FlareSolverr:

```bash
brew install node
docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest
git clone https://github.com/wutthichaikmm/web-importer.git
cd web-importer
npm install
npm start
```

แล้วเปิด <http://127.0.0.1:8787>

> ผู้พัฒนาใช้ Windows เป็นหลัก ส่วนของ Mac นี้อาศัยอิมเมจ Docker ที่เผยแพร่สำหรับ arm64/amd64 และเทสต์ compose บนเครื่อง Windows แต่ **ยังไม่ได้ทดลองบน Mac จริง** ถ้าพบปัญหา แจ้งใน [Issues](https://github.com/wutthichaikmm/web-importer/issues) พร้อมรุ่นของ macOS และชิปที่ใช้ได้เลย ตัวติดตั้งแบบดับเบิลคลิก (แอป `.dmg`) สำหรับ Mac ยังไม่มี

## วิธีใช้งาน

หน้าเว็บมี 2 แท็บ: **ดึงจากเว็บ** และ **จัดการไฟล์ .txt** สลับแท็บระหว่างดึงได้ งานที่ดึงอยู่จะทำต่อ และป้ายบนแท็บแสดงความคืบหน้า เช่น `45/100` สถานะ FlareSolverr แสดงที่มุมขวาบน

### ดึงตอนจากเว็บ

1. วาง URL หน้าสารบัญของนิยาย (หน้าที่แสดงรายชื่อตอนทั้งหมด) แล้วกด **ดึงสารบัญ**
2. **เลือกตอน** ทุกตอนถูกเลือกไว้ก่อน
   - **เลือกทั้งหมด / ยกเลิกทั้งหมด**
   - พิมพ์ช่วงเลขตอนแล้วกด **เลือกช่วง** (เช่น 101 ถึง 200 รวมทั้งสองปลาย)
   - คลิกแถวเพื่อเลือกทีละตอน หรือ Shift + คลิกเพื่อเลือกเป็นช่วง
   - **เริ่มเลขที่ #** ตั้งเลขตอนแรกให้ตรงกับเลขจริงของนิยาย และ **สลับลำดับ** ใช้เมื่อสารบัญเรียงจากใหม่ไปเก่า
3. ปรับ **หน่วง (ms)** (ระยะห่างระหว่างการเริ่มแต่ละคำขอ) และ **พร้อมกัน** (จำนวนที่ดึงพร้อมกัน 1–12) ในแผงด้านขวา แล้วกด **เริ่มดึง N ตอน** สถานะของแต่ละตอน (รอคิว, กำลังดึง, สำเร็จ, ล้มเหลวพร้อมสาเหตุ) แสดงในแถวของรายการ
4. ต้องการหยุด กด **หยุด** ระบบหยุดคิวและคำขอที่ค้าง เก็บตอนที่สำเร็จไว้ครบ
5. ตอนที่ล้มเหลวหรือถูกหยุด กด **ลองดึงตอนที่ไม่สำเร็จ (k)** เพื่อดึงเฉพาะตอนเหล่านั้นใหม่
6. เก็บผลลัพธ์ได้ 2 แบบ ทั้งสองใช้ข้อความเดียวกัน คือเฉพาะตอนที่เลือกและดึงสำเร็จ เรียงตามลำดับในรายการ กดได้ระหว่างดึงและหลังดึงเสร็จ
   - **ดาวน์โหลด .txt (n ตอน)** ได้ไฟล์ `chapters-YYYYMMDD-HHmm.txt` (UTF-8)
   - **คัดลอกข้อความ (n ตอน)** คัดลอกไปวางที่อื่นโดยไม่ต้องดาวน์โหลด (ถ้าหลายร้อยตอน ดาวน์โหลดเป็นไฟล์จะสะดวกกว่า)
7. **เริ่มใหม่** ล้างรายการทั้งหมดแต่คง URL ไว้ ถ้ามีตอนที่ดึงสำเร็จ ระบบจะถามยืนยันก่อน (เช่นเดียวกับตอนดึงสารบัญใหม่หรือปิดหน้าเว็บ)

ไฟล์ที่ส่งออกไม่มี HTML หรือโฆษณาหลักของหน้าเว็บ และลบชื่อตอนที่ซ้ำอยู่บรรทัดแรกของเนื้อหาให้แล้ว แม้ชื่อในสารบัญจะถูกตัดสั้น ขาดเครื่องหมายวรรคตอน หรือเลขตอนไม่ตรงกับหน้าเนื้อหา โดยใช้เลขตอนจากสารบัญคู่กับชื่อตอนที่ครบที่สุด

### จัดรูปแบบและตัดช่วงจากไฟล์ `.txt`

แท็บนี้ทำงานในเบราว์เซอร์ทั้งหมด ไฟล์ไม่ถูกอัปโหลดไปที่ server หรือ FlareSolverr

1. เลือกไฟล์ `.txt`
2. เลือก encoding เป็น **อัตโนมัติ** (ลอง UTF-8) หรือระบุ UTF-8, GB18030, GBK, Big5 ให้ตรงกับไฟล์ ถ้าอ่านภาษาจีนออกมาเป็นอักขระเพี้ยน ให้ลองเปลี่ยน encoding
3. ตั้งช่วงตอน (ค่าเริ่มต้น 205 ถึง 400)
4. กด **จัดรูปแบบและตัดช่วง**
5. ตรวจตัวอย่าง แล้วกด **ดาวน์โหลดผลลัพธ์** หรือ **คัดลอกผลลัพธ์** (คัดลอกทั้งหมด ไม่ใช่เฉพาะส่วนที่แสดงตัวอย่าง)

ขั้นตอนนี้เติม `章` ให้หัวตอนที่ยังไม่มี (เช่น `第899抱一下吧` เป็น `第899章抱一下吧`), จัดบรรทัดว่างรอบหัวตอน และตัดช่วงแบบรวมตอนต้นและตอนท้าย ไฟล์ผลลัพธ์ชื่อเช่น `formatted-chapters-205-400.txt` บันทึกเป็น UTF-8

## ตั้งค่า

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `FLARESOLVERR_URL` | `http://127.0.0.1:8191` | ที่อยู่ของ FlareSolverr (ใช้กับวิธีที่ 3 และ Docker) |
| `PORT` | `8787` | พอร์ตของ Web Importer (วิธีที่ 3) |

ตัวอย่าง (PowerShell):

```powershell
$env:FLARESOLVERR_URL = 'http://127.0.0.1:8191'
npm start
```

## สำหรับนักพัฒนา

```bash
npm run dev    # รัน server แบบ restart อัตโนมัติเมื่อแก้ไฟล์
npm test       # รันชุดทดสอบทั้งหมด
```

- การทดสอบ end-to-end ใช้ FlareSolverr จำลองในเครื่อง ไม่ต้องเปิด FlareSolverr จริง
- ตรรกะฝั่งหน้าเว็บที่ทดสอบได้อยู่ใน `public/app-core.js` ส่วนหน้าจอแต่ละแท็บอยู่ใน `public/importer.js` และ `public/file-tools.js`
- โค้ดสำหรับตัวติดตั้ง Windows อยู่ใน `packaging/`
- ยินดีรับ issue และ pull request ก่อนส่ง pull request ขอให้ `npm test` ผ่านทั้งหมด และเพิ่มเทสต์ให้กับพฤติกรรมที่เปลี่ยน ถ้าพบว่าเว็บไหนดึงรายการตอนหรือเนื้อหาไม่ได้ ใส่ URL หน้าสารบัญ (ถ้าไม่เป็นความลับ) ใน issue จะช่วยให้เพิ่มรองรับได้ง่ายขึ้น

## ข้อควรรู้และข้อจำกัด

- server ฟังเฉพาะ `127.0.0.1` เครื่องอื่นในเครือข่ายเข้าถึงไม่ได้ และรองรับ URL `http` และ `https` เท่านั้น
- การดึงเนื้อหาผ่าน FlareSolverr ช้ากว่าการเปิดเว็บปกติ และเว็บที่ป้องกันเข้มอาจดึงไม่สำเร็จเป็นบางตอน ใช้ปุ่ม "ลองดึงตอนที่ไม่สำเร็จ" หรือลดค่า "พร้อมกัน" และเพิ่ม "หน่วง"
- ตัวเลือกตรวจจับรายการตอนและเนื้อหาอิงโครงสร้างเว็บที่พบบ่อย ไม่ได้รองรับทุกเว็บ
- ตัวติดตั้ง Windows ไม่ได้เซ็นชื่อดิจิทัล Windows SmartScreen หรือแอนติไวรัสบางตัวอาจเตือนผิดพลาด
- **ใช้เครื่องมือนี้กับเว็บไซต์และเนื้อหาที่คุณมีสิทธิ์เข้าถึงและดาวน์โหลดเท่านั้น** โปรดเคารพข้อกำหนดการใช้งานของเว็บไซต์และลิขสิทธิ์ของเจ้าของผลงาน ผู้พัฒนาไม่รับผิดชอบต่อการนำไปใช้ของผู้ใช้

## ใบอนุญาตและเครดิต

โค้ดของโปรเจกต์นี้เผยแพร่ภายใต้ [MIT License](LICENSE)

โปรเจกต์นี้ใช้และ (ในตัวติดตั้ง Windows) รวมซอฟต์แวร์ของผู้อื่นซึ่งมีใบอนุญาตของตัวเอง:

- [FlareSolverr](https://github.com/FlareSolverr/FlareSolverr) (MIT) และ Chromium ที่แนบมากับมัน สำหรับผ่านหน้าตรวจสอบของเว็บ
- [Express](https://expressjs.com/) และ [node-html-parser](https://github.com/taoqf/node-html-parser) (MIT)
- [Node.js](https://nodejs.org/) (MIT) ซึ่งฝังอยู่ใน `WebImporter.exe` ของตัวติดตั้ง
- สร้างตัวติดตั้งด้วย [Inno Setup](https://jrsoftware.org/isinfo.php)

เครื่องมือนี้ไม่เกี่ยวข้องกับ FlareSolverr หรือเว็บไซต์ใด ๆ ที่ใช้ดึงเนื้อหา
