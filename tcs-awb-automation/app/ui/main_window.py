from __future__ import annotations

"""Giao diện PySide6 tối giản cho vận hành kho TECS-TCS."""

from pathlib import Path

from app.config import Settings, ensure_runtime_dirs
from app.data.repository import Repository
from app.services.batch_service import BatchService
from app.services.excel_service import create_import_template, excel_to_validated_rows


def run_ui(settings: Settings) -> int:
    ensure_runtime_dirs(settings)
    from PySide6.QtCore import Qt
    from PySide6.QtWidgets import (
        QApplication,
        QCheckBox,
        QFileDialog,
        QHBoxLayout,
        QLabel,
        QMainWindow,
        QMessageBox,
        QPushButton,
        QTableWidget,
        QTableWidgetItem,
        QVBoxLayout,
        QWidget,
    )

    class MainWindow(QMainWindow):
        def __init__(self) -> None:
            super().__init__()
            self.setWindowTitle("TCS AWB Automation — TECS-TCS")
            self.resize(980, 640)
            self.settings = settings
            self.repo = Repository(settings.db_path)
            self.batch = BatchService(settings, self.repo)
            self.rows = []
            self.excel_path: Path | None = None

            root = QWidget()
            self.setCentralWidget(root)
            layout = QVBoxLayout(root)

            layout.addWidget(QLabel("Phạm vi: chỉ kho TECS-TCS · Không lưu mật khẩu TCS"))
            self.chk_mock = QCheckBox("Mock TCS (test không cần login)")
            self.chk_mock.setChecked(settings.mock)
            self.chk_dry = QCheckBox("Dry-run in (không gửi máy in)")
            self.chk_dry.setChecked(True)
            layout.addWidget(self.chk_mock)
            layout.addWidget(self.chk_dry)

            btns = QHBoxLayout()
            self.btn_template = QPushButton("Tạo template Excel")
            self.btn_open = QPushButton("Chọn Excel")
            self.btn_validate = QPushButton("Kiểm tra dữ liệu")
            self.btn_run = QPushButton("Chạy tác vụ")
            self.btn_agent = QPushButton("Chạy Agent API (Ops)")
            for b in (
                self.btn_template,
                self.btn_open,
                self.btn_validate,
                self.btn_run,
                self.btn_agent,
            ):
                btns.addWidget(b)
            layout.addLayout(btns)

            self.table = QTableWidget(0, 6)
            self.table.setHorizontalHeaderLabels(["STT", "AWB", "ACTION", "Trạng thái", "File", "Lỗi"])
            layout.addWidget(self.table)
            self.status = QLabel("Sẵn sàng")
            layout.addWidget(self.status)

            self.btn_template.clicked.connect(self.on_template)
            self.btn_open.clicked.connect(self.on_open)
            self.btn_validate.clicked.connect(self.on_validate)
            self.btn_run.clicked.connect(self.on_run)
            self.btn_agent.clicked.connect(self.on_agent)

        def on_template(self) -> None:
            path = self.settings.templates_dir / "AWB_IMPORT_TEMPLATE.xlsx"
            create_import_template(path)
            QMessageBox.information(self, "Template", f"Đã tạo:\n{path}")

        def on_open(self) -> None:
            path, _ = QFileDialog.getOpenFileName(self, "Chọn Excel", "", "Excel (*.xlsx)")
            if not path:
                return
            self.excel_path = Path(path)
            self.status.setText(f"Đã chọn: {self.excel_path.name}")

        def on_validate(self) -> None:
            if not self.excel_path:
                QMessageBox.warning(self, "Thiếu file", "Chọn Excel trước")
                return
            self.rows = excel_to_validated_rows(self.excel_path)
            self.table.setRowCount(len(self.rows))
            errs = 0
            for i, r in enumerate(self.rows):
                vals = [str(r.stt), r.awb_display, r.action.value, "", "", r.validation_error or ""]
                if r.validation_error:
                    errs += 1
                for c, v in enumerate(vals):
                    self.table.setItem(i, c, QTableWidgetItem(v))
            self.status.setText(f"Kiểm tra xong: {len(self.rows)} dòng, {errs} lỗi")

        def on_run(self) -> None:
            if not self.rows:
                self.on_validate()
            if not self.rows:
                return
            invalid = [r for r in self.rows if r.validation_error]
            if invalid:
                QMessageBox.warning(self, "Dữ liệu lỗi", f"Có {len(invalid)} dòng lỗi — sửa trước khi chạy")
                return
            job = self.batch.create_job_from_rows(
                self.rows,
                source="excel",
                dry_run=self.chk_dry.isChecked(),
                mock=self.chk_mock.isChecked(),
            )
            results, report = self.batch.run(job)
            self.table.setRowCount(len(results))
            for i, r in enumerate(results):
                vals = [
                    str(r.stt),
                    r.awb,
                    r.action,
                    r.normalized_status,
                    r.downloaded_file,
                    r.error_message,
                ]
                for c, v in enumerate(vals):
                    self.table.setItem(i, c, QTableWidgetItem(v))
            self.status.setText(f"Xong — báo cáo: {report}")
            QMessageBox.information(self, "Hoàn tất", f"Đã xuất:\n{report}")

        def on_agent(self) -> None:
            from app.services.agent_api import serve_agent

            QMessageBox.information(
                self,
                "Agent API",
                f"Sẽ chạy agent tại http://{self.settings.agent_host}:{self.settings.agent_port}\n"
                "Đóng cửa sổ console để dừng. Ops gọi POST /jobs.",
            )
            self.hide()
            serve_agent(self.settings)

    app = QApplication([])
    win = MainWindow()
    win.show()
    return app.exec()