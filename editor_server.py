#!/usr/bin/env python3
"""
Simple server for the Question Database Editor.
Handles saving changes to questions.json and question_metadata.json.

Run: python3 editor_server.py
Then open: http://localhost:8765/question_editor.html
"""

import http.server
import socketserver
import json
import os
from urllib.parse import urlparse
from datetime import datetime

PORT = 8765
QUESTIONS_FILE = 'questions.json'
METADATA_FILE = 'question_metadata.json'

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


def main():
    # Change to script directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    with socketserver.TCPServer(("", PORT), EditorHandler) as httpd:
        print(f"\n{'='*50}")
        print(f"  Question Database Editor Server")
        print(f"{'='*50}")
        print(f"\n  Open in browser: http://localhost:{PORT}/question_editor.html")
        print(f"\n  Press Ctrl+C to stop the server")
        print(f"{'='*50}\n")

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")


if __name__ == '__main__':
    main()
