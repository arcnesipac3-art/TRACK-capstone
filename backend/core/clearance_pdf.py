"""
TRACK — clearance certificate PDF.

One page, built from the clearance record alone: nothing on the certificate is
composed here that is not already stored on the row, so the paper and the
database can never disagree about who cleared, when and on whose decision.

Generated server-side rather than printed from the browser because the
certificate is a record the school issues: a learner who lost the file has to be
able to ask for the same document again, and 'print this screen' cannot promise
that after the period's configuration or the department list moves on.
"""

import io

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .models import DepartmentStatus

SCHOOL_NAME = "Kiwalan National High School"
SCHOOL_ADDRESS = "Purok 10 Mato-og, Kiwalan, Iligan City, Lanao del Norte 9200"

NAVY = colors.HexColor("#12294a")
MUTED = colors.HexColor("#5b6b82")
RULE = colors.HexColor("#c3ccd9")

#: The sign-offs a certificate is willing to state as fact.
_PRINTED_STATUSES = {
    DepartmentStatus.APPROVED: "Cleared",
    DepartmentStatus.NOT_APPLICABLE: "Not applicable",
}


def _styles():
    return {
        "over": ParagraphStyle(
            "over", alignment=TA_CENTER, fontSize=8.5, leading=11,
            textColor=MUTED, spaceAfter=1,
        ),
        "school": ParagraphStyle(
            "school", alignment=TA_CENTER, fontSize=15, leading=18,
            textColor=NAVY, fontName="Helvetica-Bold",
        ),
        "title": ParagraphStyle(
            "title", alignment=TA_CENTER, fontSize=17, leading=21,
            textColor=NAVY, fontName="Helvetica-Bold", spaceBefore=14,
        ),
        "subtitle": ParagraphStyle(
            "subtitle", alignment=TA_CENTER, fontSize=10, leading=13, textColor=MUTED
        ),
        "body": ParagraphStyle(
            "body", alignment=TA_CENTER, fontSize=10, leading=15,
            textColor=colors.HexColor("#1f2d3d"),
        ),
        "name": ParagraphStyle(
            "name", alignment=TA_CENTER, fontSize=16, leading=20,
            textColor=NAVY, fontName="Helvetica-Bold", spaceBefore=8, spaceAfter=2,
        ),
        "label": ParagraphStyle(
            "label", fontSize=8, leading=10, textColor=MUTED
        ),
        "value": ParagraphStyle(
            "value", fontSize=9.5, leading=12, textColor=colors.HexColor("#1f2d3d")
        ),
        "cell": ParagraphStyle("cell", fontSize=8.5, leading=11),
        "foot": ParagraphStyle(
            "foot", alignment=TA_CENTER, fontSize=7.5, leading=10, textColor=MUTED
        ),
    }


def _local(value):
    """Certificate timestamps read in the school's own hours, not UTC."""
    if value is None:
        return "—"
    return timezone.localtime(value).strftime("%B %d, %Y")


def _esc(value):
    """Paragraphs parse a subset of HTML, so stored text must be escaped."""
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def build_certificate_pdf(record):
    """
    Render one cleared learner's certificate as PDF bytes.

    The caller has already established the record is cleared — this function
    does not re-check permissions, it only lays out what the record says.
    """
    styles = _styles()
    student = record.student
    learner = student.user
    period = record.period
    full_name = " ".join(
        part for part in (
            learner.first_name, learner.middle_name, learner.last_name
        ) if part
    ) or learner.username

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=22 * mm,
        rightMargin=22 * mm,
        topMargin=18 * mm,
        bottomMargin=16 * mm,
        title=f"Clearance Certificate {record.reference}",
        author=SCHOOL_NAME,
        subject=f"{period.name} clearance",
    )

    story = [
        Paragraph("Republic of the Philippines", styles["over"]),
        Paragraph("Department of Education", styles["over"]),
        Paragraph(SCHOOL_NAME, styles["school"]),
        Paragraph(SCHOOL_ADDRESS, styles["over"]),
        Spacer(1, 4),
        HRFlowable(width="100%", thickness=1, color=RULE),
        Paragraph("Certificate of Clearance", styles["title"]),
        Paragraph(
            _esc(
                " · ".join(filter(None, [
                    period.name,
                    period.school_year.label,
                    f"{period.get_semester_display()} Semester" if period.semester else "",
                    period.type_label,
                ]))
            ),
            styles["subtitle"],
        ),
        Spacer(1, 16),
        Paragraph("This certifies that", styles["body"]),
        Paragraph(_esc(full_name), styles["name"]),
        Paragraph(
            _esc(
                " · ".join(filter(None, [
                    f"LRN {student.lrn}" if student.lrn else "",
                    str(record.grade_level or ""),
                    record.section_name,
                ]))
            ),
            styles["subtitle"],
        ),
        Spacer(1, 12),
        Paragraph(
            "has been cleared by every office the school named for this period, "
            "and has no outstanding obligation recorded against them.",
            styles["body"],
        ),
        Spacer(1, 16),
    ]

    rows = [
        [
            Paragraph("Reference number", styles["label"]),
            Paragraph(f"<b>{_esc(record.reference)}</b>", styles["value"]),
            Paragraph("Date cleared", styles["label"]),
            Paragraph(_local(record.cleared_at), styles["value"]),
        ],
        [
            Paragraph("Approved by", styles["label"]),
            Paragraph(
                _esc(
                    (record.cleared_by.get_full_name() or record.cleared_by.username)
                    # An account deleted after signing leaves no name behind; the
                    # school is the issuer, so no office name is invented here.
                    if record.cleared_by else SCHOOL_NAME
                ),
                styles["value"],
            ),
            Paragraph("Period closed", styles["label"]),
            Paragraph(_local(period.closes_at), styles["value"]),
        ],
    ]
    story.append(Table(
        rows,
        colWidths=[32 * mm, 58 * mm, 30 * mm, 58 * mm],
        style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f6f8fb")),
            ("BOX", (0, 0), (-1, -1), 0.5, RULE),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, RULE),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ]),
    ))
    story.append(Spacer(1, 16))

    table_rows = [[
        Paragraph("Office", styles["label"]),
        Paragraph("Standing", styles["label"]),
        Paragraph("Signed off by", styles["label"]),
        Paragraph("Date", styles["label"]),
    ]]
    for item in record.departments.select_related("department", "decided_by"):
        standing = _PRINTED_STATUSES.get(item.status)
        if standing is None:
            continue
        officer = item.decided_by_name or (
            item.decided_by.get_full_name() if item.decided_by else ""
        ) or "—"
        table_rows.append([
            Paragraph(_esc(item.department.name), styles["cell"]),
            Paragraph(standing, styles["cell"]),
            Paragraph(_esc(officer), styles["cell"]),
            Paragraph(_local(item.decided_at), styles["cell"]),
        ])

    story.append(Table(
        table_rows,
        colWidths=[62 * mm, 30 * mm, 50 * mm, 44 * mm],
        repeatRows=1,
        style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, 0), 0.75, NAVY),
            ("LINEBELOW", (0, 1), (-1, -2), 0.25, RULE),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]),
    ))

    issued = timezone.localtime()
    story += [
        Spacer(1, 18),
        HRFlowable(width="100%", thickness=0.5, color=RULE),
        Spacer(1, 6),
        Paragraph(
            "This certificate is issued by TRACK, the school's digital clearance "
            "system. The reference number above is recorded against the learner's "
            "clearance record and can be verified with the Registrar. Any later "
            "withdrawal of this clearance is entered on that record.",
            styles["foot"],
        ),
        Spacer(1, 4),
        Paragraph(
            f"Document generated {issued:%B %d, %Y, %H:%M} "
            f"(Asia/Manila) · {SCHOOL_NAME}",
            styles["foot"],
        ),
    ]

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
