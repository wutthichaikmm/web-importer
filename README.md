# Web Importer

เครื่องมือ local สำหรับดึงรายการ chapter จากหน้าสารบัญ ผ่าน FlareSolverr แล้วรวมตอนที่ดึงสำเร็จเป็นไฟล์ข้อความ UTF-8 ไฟล์เดียว

## Requirements

- Node.js 20 หรือใหม่กว่า
- FlareSolverr ทำงานอยู่ที่ `http://127.0.0.1:8191`

## Run

เปิด PowerShell แล้วรัน:

```powershell
Set-Location 'E:\web-importer'
npm install
npm start
```

จากนั้นเปิด [http://127.0.0.1:8787](http://127.0.0.1:8787)

## Start FlareSolverr

ถ้ายังไม่มี FlareSolverr ให้รัน Docker:

```powershell
docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest
```

ค่าเริ่มต้นใช้ `http://127.0.0.1:8191` หากใช้ endpoint อื่นในเครื่อง ให้ตั้งค่า `FLARESOLVERR_URL` ก่อน `npm start`:

```powershell
$env:FLARESOLVERR_URL = 'http://127.0.0.1:8191'
npm start
```

## Usage

1. วาง URL หน้าสารบัญนิยาย
2. กด `ดึงสารบัญ`
3. เลือก chapter และปรับเลขเริ่มต้น, delay, concurrency หรือลำดับ
4. กด `เริ่มดึงเนื้อหา`
5. ระหว่างดึง กด `ดาวน์โหลดทันที` เพื่อบันทึกเฉพาะ chapter ที่สำเร็จแล้ว โดยงานที่เหลือจะทำต่อ
6. หากต้องการหยุด กด `หยุดการดึง` ระบบจะหยุดคิวและคำขอจากหน้าเว็บ พร้อมเก็บ chapter ที่สำเร็จไว้
7. กด `ดาวน์โหลดไฟล์ .txt` เพื่อบันทึกผลที่สำเร็จเป็นไฟล์เดียว

ไฟล์ที่ export ใช้ชื่อรูปแบบ `chapters-YYYYMMDD-HHmm.txt` และเข้ารหัส UTF-8 โดยไม่มี HTML หรือโฆษณาหลักจากหน้าเว็บ

## Development

ใช้คำสั่งนี้เพื่อให้ server restart เมื่อแก้ไฟล์:

```powershell
npm run dev
```

รัน test suite:

```powershell
npm test
```

การทดสอบ end-to-end ใช้ FlareSolverr test double ในเครื่อง จึงไม่ต้องเปิด FlareSolverr จริงสำหรับ automated tests

## Notes

- Server bind เฉพาะ `127.0.0.1` ไม่เปิดให้เครื่องอื่นใน network เข้าถึง
- รองรับ URL `http` และ `https` เท่านั้น
- การดึงเนื้อหาหลายตอนจะทำพร้อมกันตามค่า concurrency และหน่วงตามค่า delay เพื่อไม่ยิง request ต่อเนื่องเร็วเกินไป
- ใช้เครื่องมือนี้กับเว็บไซต์และเนื้อหาที่คุณมีสิทธิ์เข้าถึงและดาวน์โหลด


