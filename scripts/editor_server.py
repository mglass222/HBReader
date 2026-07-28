#!/usr/bin/env python3
"""
Simple server for the Question Database Editor.
Handles saving changes to questions and metadata JSON files.

Usage:
    python3 editor_server.py [--questions FILE] [--metadata FILE] [--port PORT]

Options:
    --questions, -q  Questions JSON file (default: nat_hist_bee_questions.json)
    --metadata, -m   Metadata JSON file (default: nat_hist_bee_question_metadata.json)
    --port, -p       Server port (default: 8765)
"""

import argparse
import http.server
import socketserver
import json
import os
import shutil
from datetime import datetime
from pathlib import Path

# Configuration (must be specified via command line)
DEFAULT_PORT = 8765
PORT = DEFAULT_PORT
QUESTIONS_FILE = None
METADATA_FILE = None
PROJECT_ROOT = None
MAX_BODY_BYTES = 10 * 1024 * 1024  # 10 MB cap on save payloads


def allowed_origins():
    return {
        f'http://localhost:{PORT}',
        f'http://127.0.0.1:{PORT}',
    }


class EditorHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Restrict CORS to the local editor origin.
        origin = self.headers.get('Origin')
        if origin in allowed_origins():
            self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        if self.path == '/save':
            self.handle_save()
        else:
            self.send_error(404, 'Not Found')

    def reject_cross_origin_request(self):
        """CSRF guard: CORS headers alone do not stop a cross-origin page from
        executing a 'simple' POST against this server. Reject any browser
        request whose Origin is not the local editor, and require the JSON
        content type so no-preflight form/text submissions are refused.
        Requests without an Origin header (curl, scripts) are allowed."""
        origin = self.headers.get('Origin')
        if origin is not None and origin not in allowed_origins():
            self.send_error(403, 'Cross-origin requests are not allowed')
            return True

        content_type = (self.headers.get('Content-Type') or '').split(';')[0].strip().lower()
        if content_type != 'application/json':
            self.send_error(415, 'Content-Type must be application/json')
            return True

        return False

    def handle_save(self):
        if self.reject_cross_origin_request():
            return

        try:
            # Read request body (bounded)
            content_length = int(self.headers.get('Content-Length') or 0)
            if content_length <= 0:
                self.send_error(400, 'Missing request body')
                return
            if content_length > MAX_BODY_BYTES:
                self.send_error(413, 'Request body too large')
                return
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))

            # Extract data
            original_id = data['original_id']
            original_category = data['original_category']
            new_id = data['id']
            new_category = data['category']
            question_text = data['question']
            answer_text = data['answer']
            new_metadata = data['metadata']

            # Load current files
            with open(QUESTIONS_FILE, 'r', encoding='utf-8') as f:
                questions = json.load(f)

            with open(METADATA_FILE, 'r', encoding='utf-8') as f:
                metadata = json.load(f)

            # Backup before modifying (microseconds avoid same-second collisions)
            backup_time = datetime.now().strftime('%Y%m%d_%H%M%S_%f')
            backup_dir = PROJECT_ROOT / 'backup'
            backup_dir.mkdir(exist_ok=True)
            questions_backup = backup_dir / f'{QUESTIONS_FILE.stem}_{backup_time}{QUESTIONS_FILE.suffix}'
            metadata_backup = backup_dir / f'{METADATA_FILE.stem}_{backup_time}{METADATA_FILE.suffix}'
            shutil.copy2(QUESTIONS_FILE, questions_backup)
            shutil.copy2(METADATA_FILE, metadata_backup)

            # Find and update the question
            found = False
            for i, q in enumerate(questions.get(original_category, [])):
                if q['id'] == original_id:
                    found = True

                    if original_category != new_category:
                        # Moving to different category
                        questions[original_category].pop(i)

                        # Add to new category
                        new_question = {
                            'number': len(questions.get(new_category, [])) + 1,
                            'question': question_text,
                            'answer': answer_text,
                            'id': new_id
                        }
                        if new_category not in questions:
                            questions[new_category] = []
                        questions[new_category].append(new_question)

                        # Update metadata with new ID if changed
                        if original_id != new_id:
                            if original_id in metadata.get('categories', {}):
                                del metadata['categories'][original_id]
                    else:
                        # Update in place
                        questions[original_category][i]['question'] = question_text
                        questions[original_category][i]['answer'] = answer_text
                        if original_id != new_id:
                            questions[original_category][i]['id'] = new_id
                            # Update metadata key
                            if original_id in metadata.get('categories', {}):
                                del metadata['categories'][original_id]
                    break

            if not found:
                self.send_error(404, f'Question {original_id} not found in {original_category}')
                return

            # Update metadata
            if 'categories' not in metadata:
                metadata['categories'] = {}

            metadata['categories'][new_id] = {
                'regions': new_metadata.get('regions', []),
                'time_periods': new_metadata.get('time_periods', []),
                'answer_type': new_metadata.get('answer_type', ''),
                'subject_themes': new_metadata.get('subject_themes', [])
            }

            # Update progress info
            if '_progress' in metadata:
                metadata['_progress']['last_updated'] = datetime.now().isoformat()

            # Save files
            with open(QUESTIONS_FILE, 'w', encoding='utf-8') as f:
                json.dump(questions, f, indent=2, ensure_ascii=False)

            with open(METADATA_FILE, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)

            print(f"[{datetime.now().strftime('%H:%M:%S')}] Saved changes to {new_id}")

            # Send success response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True}).encode())

        except Exception as e:
            print(f"Error saving: {e}")
            self.send_response(500)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(str(e).encode())


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description='Server for the Question Database Editor',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 editor_server.py --questions nat_hist_bee_questions.json --metadata nat_hist_bee_question_metadata.json
  python3 editor_server.py -q us_hist_bee_questions.json -m us_hist_bee_metadata.json
  python3 editor_server.py -q my_questions.json -m my_metadata.json -p 8080
"""
    )
    parser.add_argument('--questions', '-q', required=True,
                        help='Questions JSON file')
    parser.add_argument('--metadata', '-m', required=True,
                        help='Metadata JSON file')
    parser.add_argument('--port', '-p', type=int, default=DEFAULT_PORT,
                        help=f'Server port (default: {DEFAULT_PORT})')
    return parser.parse_args()


def resolve_project_file(path):
    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = PROJECT_ROOT / candidate
    candidate = candidate.resolve()

    try:
        candidate.relative_to(PROJECT_ROOT)
    except ValueError as exc:
        raise ValueError(f'File must be inside project root: {path}') from exc

    return candidate


def main():
    global PORT, QUESTIONS_FILE, METADATA_FILE, PROJECT_ROOT

    args = parse_args()
    PORT = args.port

    # Change to project root (parent of scripts/)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    PROJECT_ROOT = Path(os.path.dirname(script_dir)).resolve()
    os.chdir(PROJECT_ROOT)

    try:
        QUESTIONS_FILE = resolve_project_file(args.questions)
        METADATA_FILE = resolve_project_file(args.metadata)
    except ValueError as exc:
        print(f'Error: {exc}')
        return

    with socketserver.TCPServer(("127.0.0.1", PORT), EditorHandler) as httpd:
        print(f"\n{'='*50}")
        print(f"  Question Database Editor Server")
        print(f"{'='*50}")
        print(f"\n  Questions file: {QUESTIONS_FILE}")
        print(f"  Metadata file:  {METADATA_FILE}")
        print(f"\n  Open in browser: http://127.0.0.1:{PORT}/question_editor.html")
        print(f"\n  Press Ctrl+C to stop the server")
        print(f"{'='*50}\n")

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")


if __name__ == '__main__':
    main()
