"""Generate the Excel database template for TELKOM AKSES INTERNSHIP.

The workbook is intentionally compatible with Code.gs:
- Sheet names and headers match HEADERS in Code.gs.
- The default workbook contains headers only; it has no local users, passwords,
  attendance, or settings.

Run:
    python database/generate_excel.py

To refresh the local workbook with the latest live data, export from the app
(TELKOM AKSES > Export Excel) and pass the downloaded file:

    python database/generate_excel.py --from-export path/to/export.xlsx

Without --from-export the workbook is an empty template. Runtime app data is
always loaded from Google Sheets.
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, time
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_FILE = BASE_DIR / "TELKOM_AKSES_DATABASE.xlsx"

PINK = "EC4899"
PINK_LIGHT = "FCE7F3"
GRAY_LIGHT = "F3F4F6"
WHITE = "FFFFFF"
DARK = "111827"

HEADERS = {
    "Users": [
        "id",
        "username",
        "name",
        "password",
        "role",
        "active",
        "created_at",
        "updated_at",
    ],
    "Attendance": [
        "id",
        "user_id",
        "name",
        "date",
        "check_in",
        "check_out",
        "status",
        "photo_url",
        "photo_file_id",
        "photo_out_url",
        "photo_out_file_id",
        "location",
        "note",
        "source",
        "created_at",
        "updated_at",
    ],
    "Settings": ["key", "value", "description"],
    "Logs": ["timestamp", "actor", "action", "detail"],
}

COLUMN_WIDTHS = {
    "id": 18,
    "username": 14,
    "name": 20,
    "password": 24,
    "role": 10,
    "active": 9,
    "created_at": 21,
    "updated_at": 21,
    "user_id": 14,
    "date": 12,
    "check_in": 10,
    "check_out": 10,
    "status": 12,
    "photo_url": 46,
    "photo_file_id": 30,
    "photo_out_url": 46,
    "photo_out_file_id": 30,
    "location": 26,
    "note": 24,
    "source": 10,
    "key": 18,
    "value": 34,
    "description": 32,
    "timestamp": 21,
    "actor": 14,
    "action": 18,
    "detail": 48,
}


def style_header(ws, headers: list[str]) -> None:
    thin = Side(style="thin", color="E5E7EB")
    for column, header in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=column, value=header)
        cell.font = Font(bold=True, color=WHITE, size=11)
        cell.fill = PatternFill("solid", fgColor=PINK)
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = Border(bottom=thin)
        ws.column_dimensions[get_column_letter(column)].width = COLUMN_WIDTHS.get(header, 18)

    ws.row_dimensions[1].height = 24
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{max(ws.max_row, 1)}"


def add_rows(ws, rows: list[list[object]], start_row: int = 2) -> None:
    for row_index, row in enumerate(rows, start=start_row):
        for column_index, value in enumerate(row, start=1):
            cell = ws.cell(row=row_index, column=column_index, value=value)
            cell.alignment = Alignment(vertical="center", wrap_text=False)
            cell.number_format = "@"


def add_validations(wb: Workbook) -> None:
    users = wb["Users"]
    role_validation = DataValidation(type="list", formula1='"admin,intern"', allow_blank=False)
    role_validation.error = "Pilih admin atau intern"
    role_validation.errorTitle = "Role tidak valid"
    users.add_data_validation(role_validation)
    role_validation.add(f"F2:F{max(users.max_row, 2)}")

    active_validation = DataValidation(type="list", formula1='"TRUE,FALSE"', allow_blank=False)
    active_validation.error = "Pilih TRUE atau FALSE"
    active_validation.errorTitle = "Status tidak valid"
    users.add_data_validation(active_validation)
    active_validation.add(f"G2:G{max(users.max_row, 2)}")

    attendance = wb["Attendance"]
    status_validation = DataValidation(type="list", formula1='"on-time,late"', allow_blank=False)
    status_validation.error = "Pilih on-time atau late"
    status_validation.errorTitle = "Status tidak valid"
    attendance.add_data_validation(status_validation)
    status_validation.add(f"G2:G{max(attendance.max_row, 2)}")


def add_instructions(wb: Workbook) -> None:
    ws = wb.create_sheet("Petunjuk")
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 3
    ws.column_dimensions["B"].width = 110

    title = ws["B2"]
    title.value = "TELKOM AKSES INTERNSHIP — PETUNJUK DATABASE"
    title.font = Font(bold=True, size=16, color=DARK)
    title.fill = PatternFill("solid", fgColor=PINK_LIGHT)
    title.alignment = Alignment(vertical="center")
    ws.row_dimensions[2].height = 34

    lines = [
        ("", ""),
        ("CARA PAKAI", "bold"),
        ("1. Aplikasi memakai Google Sheets sebagai sumber data aktif; file ini hanya template/hasil ekspor.", ""),
        ("2. Jalankan setup() di Apps Script untuk menyiapkan database aktif dan folder foto Drive.", ""),
        ("3. Template lokal tidak tersinkron otomatis. Gunakan Export Excel dari aplikasi untuk mengambil data live.", ""),
        ("4. Untuk membuat salinan Excel dari hasil export, gunakan generate_excel.py --from-export file.xlsx.", ""),
        ("", ""),
        ("AKUN DEFAULT", "bold"),
        ("Tidak ada akun atau password di template ini; akun aktif dibaca dari Google Sheets.", ""),
        ("", ""),
        ("PENTING TENTANG PASSWORD", "bold"),
        ("- Password tidak disimpan dalam bentuk teks.", ""),
        ("- Jangan menggunakan file Excel lokal sebagai sumber data/login aplikasi.", ""),
        ("", ""),
        ("FOTO", "bold"),
        ("- Foto absen masuk/pulang otomatis disimpan ke Google Drive folder TELKOM_AKSES_FOTOS/<tahun-bulan>.", ""),
        ("- Kolom photo_url menyimpan link thumbnail, photo_file_id menyimpan ID file Drive.", ""),
        ("", ""),
        ("SHEET", "bold"),
        ("- Users      : data akun admin & peserta magang.", ""),
        ("- Attendance : catatan absen masuk/pulang, GPS, catatan, dan link foto.", ""),
        ("- Settings   : pengaturan aplikasi (jam telat, lokasi kantor, radius, timezone).", ""),
        ("- Logs       : jejak aktivitas login, absen, tambah/hapus akun, export Excel.", ""),
    ]

    row = 3
    for text, style in lines:
        cell = ws.cell(row=row, column=2, value=text)
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        if style == "bold":
            cell.font = Font(bold=True, size=12, color=PINK)
        else:
            cell.font = Font(size=10, color=DARK)
        row += 1


DATE_FIELDS = {"date"}
TIME_FIELDS = {"check_in", "check_out", "late_limit"}


def cell_text(value, header: str) -> object:
    """Normalize a Sheets value to the plain text the app stores."""
    if isinstance(value, datetime):
        if header in DATE_FIELDS:
            return value.date().isoformat()
        if header in TIME_FIELDS:
            return value.strftime("%H:%M")
        return value.strftime("%Y-%m-%dT%H:%M:%S")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, time):
        return value.strftime("%H:%M")
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if value is None:
        return ""
    return str(value)


def read_export(path: Path) -> dict[str, list[list[object]]]:
    """Read the app's exported workbook into rows keyed by sheet name."""
    source = load_workbook(path, data_only=True)
    data: dict[str, list[list[object]]] = {}

    for sheet_name, headers in HEADERS.items():
        if sheet_name not in source.sheetnames:
            raise SystemExit(f"Sheet '{sheet_name}' tidak ditemukan di {path}")

        ws = source[sheet_name]
        values = list(ws.values)
        if not values:
            data[sheet_name] = []
            continue

        header_row = [str(cell or "").strip() for cell in values[0]]
        index = {header: header_row.index(header) for header in headers if header in header_row}
        missing = [header for header in headers if header not in index]
        if missing:
            raise SystemExit(f"Kolom {missing} tidak ada di sheet {sheet_name}")

        rows = []
        for raw in values[1:]:
            if all(cell in (None, "") for cell in raw):
                continue
            rows.append([cell_text(raw[index[header]], header) for header in headers])
        data[sheet_name] = rows

    return data


def build_workbook(live_data: dict[str, list[list[object]]] | None = None) -> Workbook:
    wb = Workbook()

    default = wb.active
    default.title = "Users"

    data = live_data if live_data is not None else {
        "Users": [],
        "Attendance": [],
        "Settings": [],
        "Logs": [],
    }

    for sheet_name in ("Users", "Attendance", "Settings", "Logs"):
        if sheet_name == "Users":
            ws = wb["Users"]
        else:
            ws = wb.create_sheet(sheet_name)

        headers = HEADERS[sheet_name]
        style_header(ws, headers)
        add_rows(ws, data[sheet_name])
        ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{max(ws.max_row, 1)}"

        for row in ws.iter_rows(min_row=2, max_row=ws.max_row, max_col=len(headers)):
            for cell in row:
                cell.border = Border(bottom=Side(style="thin", color="E5E7EB"))
                if cell.row % 2 == 0:
                    cell.fill = PatternFill("solid", fgColor=GRAY_LIGHT)

    add_validations(wb)
    add_instructions(wb)
    wb.active = 0

    wb.properties.title = "TELKOM AKSES INTERNSHIP Database"
    wb.properties.subject = "Format awal database absensi magang"
    wb.properties.creator = "TELKOM AKSES INTERNSHIP"
    wb.properties.description = (
        "Database awal untuk aplikasi absensi TELKOM AKSES. "
        "Kompatibel dengan backend Google Apps Script pada Code.gs."
    )

    return wb


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate database Excel TELKOM AKSES.")
    parser.add_argument(
        "--from-export",
        type=Path,
        help="File .xlsx hasil Export Excel dari aplikasi; isinya dipakai menggantikan data template.",
    )
    parser.add_argument("--output", type=Path, default=OUTPUT_FILE, help="Lokasi file .xlsx hasil.")
    args = parser.parse_args()

    live_data = read_export(args.from_export) if args.from_export else None
    workbook = build_workbook(live_data)
    workbook.save(args.output)

    if live_data:
        counts = ", ".join(f"{name}={len(rows)}" for name, rows in live_data.items())
        print(f"Data live dimuat dari {args.from_export} ({counts})")
    print(f"Berhasil membuat: {args.output}")


if __name__ == "__main__":
    main()
