import { Question } from "./types";
import { API_URL as API_BASE_URL } from "./config";

export async function createQuestion(text: string, category?: string): Promise<Question> {
  const response = await fetch(`${API_BASE_URL}/questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, category }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create question: ${response.statusText}`);
  }

  return response.json();
}

export async function getQuestions(category?: string): Promise<Question[]> {
  const url = category
    ? `${API_BASE_URL}/questions?category=${encodeURIComponent(category)}`
    : `${API_BASE_URL}/questions`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to get questions: ${response.statusText}`);
  }

  return response.json();
}

export async function getQuestion(questionId: number): Promise<Question> {
  const response = await fetch(`${API_BASE_URL}/questions/${questionId}`);

  if (!response.ok) {
    throw new Error(`Failed to get question: ${response.statusText}`);
  }

  return response.json();
}

export async function updateQuestion(
  questionId: number,
  text?: string,
  category?: string
): Promise<Question> {
  const response = await fetch(`${API_BASE_URL}/questions/${questionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, category }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update question: ${response.statusText}`);
  }

  return response.json();
}

export async function deleteQuestion(questionId: number): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/questions/${questionId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Failed to delete question: ${response.statusText}`);
  }

  return response.json();
}

export async function toggleQuestion(questionId: number): Promise<Question> {
  const response = await fetch(`${API_BASE_URL}/questions/${questionId}/toggle`, {
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error(`Failed to toggle question: ${response.statusText}`);
  }

  return response.json();
}

export async function submitChainOfThoughtRequest(query: string): Promise<{ request_id: string }> {
  const response = await fetch(`${API_BASE_URL}/chain-of-thought`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Failed to submit request: ${response.statusText}`);
  }

  return response.json();
}
