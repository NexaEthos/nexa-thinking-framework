from fastapi import APIRouter, HTTPException
from app.models.chain_of_thought import Question
from app.services.question_manager import QuestionManager
import os

router = APIRouter()

QUESTIONS_FILE = os.getenv("QUESTIONS_FILE", "questions.json")
question_manager = QuestionManager(questions_file=QUESTIONS_FILE)


@router.get("/questions", response_model=list[Question])
async def get_questions(category: str | None = None):
    """
    Get all questions, optionally filtered by category

    Args:
        category: Optional category filter

    Returns:
        List of questions
    """
    if category:
        return question_manager.get_questions_by_category(category)
    return question_manager.get_all_questions()


@router.get("/questions/{question_id}", response_model=Question)
async def get_question(question_id: int):
    """
    Get a specific question by ID

    Args:
        question_id: The ID of the question to retrieve

    Returns:
        The requested question
    """
    question = question_manager.get_question_by_id(question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    return question


@router.post("/questions", response_model=Question)
async def create_question(text: str, category: str | None = None):
    """
    Create a new question

    Args:
        text: The question text
        category: Optional category for the question

    Returns:
        The created question
    """
    return question_manager.create_question(text=text, category=category)


@router.put("/questions/{question_id}", response_model=Question)
async def update_question(
    question_id: int,
    text: str | None = None,
    category: str | None = None,
    enabled: bool | None = None,
):
    """
    Update an existing question

    Args:
        question_id: The ID of the question to update
        text: Optional new question text
        category: Optional new category
        enabled: Optional enabled state

    Returns:
        The updated question
    """
    updated = question_manager.update_question(
        question_id, text=text, category=category, enabled=enabled
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Question not found")
    return updated


@router.patch("/questions/{question_id}/toggle", response_model=Question)
async def toggle_question(question_id: int):
    """
    Toggle a question's enabled state

    Args:
        question_id: The ID of the question to toggle

    Returns:
        The updated question
    """
    question = question_manager.get_question_by_id(question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    updated = question_manager.update_question(question_id, enabled=not question.enabled)
    if not updated:
        raise HTTPException(status_code=404, detail="Question not found")
    return updated


@router.delete("/questions/{question_id}")
async def delete_question(question_id: int):
    """
    Delete a question

    Args:
        question_id: The ID of the question to delete

    Returns:
        Success message
    """
    success = question_manager.delete_question(question_id)
    if not success:
        raise HTTPException(status_code=404, detail="Question not found")
    return {"message": "Question deleted successfully"}
