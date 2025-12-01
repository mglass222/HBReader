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
from urllib.parse import urlparse
from datetime import datetime

# Configuration (must be specified via command line)
DEFAULT_PORT = 8765
PORT = DEFAULT_PORT
QUESTIONS_FILE = None
METADATA_FILE = None

class EditorHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers for local development
        self.send_header('Access-Control-Allow-Origin', '*')
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

    def handle_save(self):
        try:
            # Read request body
            content_length = int(self.headers['Content-Length'])
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

            # Backup before modifying
            backup_time = datetime.now().strftime('%Y%m%d_%H%M%S')

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


def main():
    global PORT, QUESTIONS_FILE, METADATA_FILE

    args = parse_args()
    PORT = args.port
    QUESTIONS_FILE = args.questions
    METADATA_FILE = args.metadata

    # Change to project root (parent of scripts/)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    os.chdir(project_root)

    with socketserver.TCPServer(("", PORT), EditorHandler) as httpd:
        print(f"\n{'='*50}")
        print(f"  Question Database Editor Server")
        print(f"{'='*50}")
        print(f"\n  Questions file: {QUESTIONS_FILE}")
        print(f"  Metadata file:  {METADATA_FILE}")
        print(f"\n  Open in browser: http://localhost:{PORT}/question_editor.html")
        print(f"\n  Press Ctrl+C to stop the server")
        print(f"{'='*50}\n")

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")


if __name__ == '__main__':
    main()
