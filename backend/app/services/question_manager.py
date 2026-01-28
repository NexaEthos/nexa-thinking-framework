import json
import os
import aiofiles
from typing import List, Optional
from app.models.chain_of_thought import Question


class QuestionManager:
    def __init__(self, questions_file: str = "questions.json"):
        self.questions_file = questions_file
        self.questions = self._load_questions()

    def _load_questions(self) -> List[Question]:
        """Load questions from JSON file"""
        if not os.path.exists(self.questions_file):
            return []

        try:
            with open(self.questions_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return [Question(**q) for q in data]
        except (json.JSONDecodeError, FileNotFoundError):
            return []

    def _save_questions(self):
        """Save questions to JSON file"""
        with open(self.questions_file, "w", encoding="utf-8") as f:
            json.dump([q.model_dump() for q in self.questions], f, indent=2)

    async def _save_questions_async(self):
        """Save questions to JSON file asynchronously"""
        async with aiofiles.open(self.questions_file, mode="w", encoding="utf-8") as f:
            await f.write(json.dumps([q.model_dump() for q in self.questions], indent=2))

    def get_all_questions(self) -> List[Question]:
        """Get all questions"""
        return self.questions

    def get_question_by_id(self, question_id: int) -> Optional[Question]:
        """Get question by ID"""
        for question in self.questions:
            if question.id == question_id:
                return question
        return None

    def create_question(self, text: str, category: Optional[str] = None) -> Question:
        """Create a new question"""
        question_id = len(self.questions) + 1
        question = Question(id=question_id, text=text, category=category)
        self.questions.append(question)
        self._save_questions()
        return question

    def update_question(
        self,
        question_id: int,
        text: Optional[str] = None,
        category: Optional[str] = None,
        enabled: Optional[bool] = None,
    ) -> Optional[Question]:
        """Update an existing question"""
        question = self.get_question_by_id(question_id)
        if not question:
            return None

        if text is not None:
            question.text = text
        if category is not None:
            question.category = category
        if enabled is not None:
            question.enabled = enabled

        self._save_questions()
        return question

    def delete_question(self, question_id: int) -> bool:
        """Delete a question"""
        question = self.get_question_by_id(question_id)
        if not question:
            return False

        self.questions = [q for q in self.questions if q.id != question_id]
        self._save_questions()
        return True

    def get_questions_by_category(self, category: str) -> List[Question]:
        """Get questions by category"""
        return [q for q in self.questions if q.category == category]

    def get_question_texts(self) -> List[str]:
        """Get all enabled question texts for chain-of-thought processing"""
        return [q.text for q in self.questions if q.enabled]

    def get_enabled_questions(self) -> List[Question]:
        """Get only enabled questions"""
        return [q for q in self.questions if q.enabled]
