import { useState, useEffect, useCallback } from "react";
import "./RAGChunkViewer.css";
import { API_BASE_URL as API_BASE } from "../services/api/config";

interface ChunkInfo {
  id: string;
  content: string;
  content_preview: string;
  char_count: number;
  word_count: number;
  metadata: Record<string, unknown>;
  created_at: string | null;
}

interface CollectionInfo {
  name: string;
  vectors_count: number;
  status: string;
}

interface EmbeddingInfo {
  provider: string;
  model: string;
  vector_size: number;
  distance_metric: string;
}

interface SimilarityResult {
  id: string;
  content: string;
  content_preview: string;
  score: number;
  score_percent: number;
  score_explanation: string;
  metadata: Record<string, unknown>;
}

interface SimilaritySearchResponse {
  query: string;
  query_preview: string;
  collection: string;
  total_results: number;
  results: SimilarityResult[];
  embedding_info: EmbeddingInfo;
}

interface RAGChunkViewerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RAGChunkViewer({ isOpen, onClose }: RAGChunkViewerProps) {
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string>("");
  const [chunks, setChunks] = useState<ChunkInfo[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [embeddingInfo, setEmbeddingInfo] = useState<EmbeddingInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SimilaritySearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  
  const [expandedChunk, setExpandedChunk] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"browse" | "search">("browse");

  const loadCollections = useCallback(async () => {
    try {
      const [collectionsRes, embeddingRes] = await Promise.all([
        fetch(`${API_BASE}/api/vectors/collections`),
        fetch(`${API_BASE}/api/vectors/embedding-info`),
      ]);
      
      if (collectionsRes.ok) {
        const data = await collectionsRes.json();
        setCollections(data);
        if (data.length > 0 && !selectedCollection) {
          setSelectedCollection(data[0].name);
        }
      }
      
      if (embeddingRes.ok) {
        setEmbeddingInfo(await embeddingRes.json());
      }
    } catch (err) {
      setError("Failed to load collections");
    }
  }, [selectedCollection]);

  const loadChunks = useCallback(async () => {
    if (!selectedCollection) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`${API_BASE}/api/vectors/collections/${selectedCollection}/chunks?limit=50`);
      if (!res.ok) throw new Error("Failed to load chunks");
      
      const data = await res.json();
      setChunks(data.chunks);
      setTotalChunks(data.total_chunks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chunks");
    } finally {
      setIsLoading(false);
    }
  }, [selectedCollection]);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !selectedCollection) return;
    
    setIsSearching(true);
    setError(null);
    
    try {
      const res = await fetch(`${API_BASE}/api/vectors/search-detailed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
          collection: selectedCollection,
          limit: 10,
          score_threshold: 0.3,
        }),
      });
      
      if (!res.ok) throw new Error("Search failed");
      
      const data = await res.json();
      setSearchResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCollections();
    }
  }, [isOpen, loadCollections]);

  useEffect(() => {
    if (selectedCollection && activeTab === "browse") {
      loadChunks();
    }
  }, [selectedCollection, activeTab, loadChunks]);

  if (!isOpen) return null;

  const getScoreColor = (score: number) => {
    if (score >= 0.85) return "#10b981";
    if (score >= 0.70) return "#3b82f6";
    if (score >= 0.50) return "#f59e0b";
    return "#ef4444";
  };

  return (
    <div className="rag-viewer-overlay" onClick={onClose}>
      <div className="rag-viewer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rag-viewer-header">
          <div className="header-title">
            <span className="header-icon">🧬</span>
            <h2>RAG Chunk Viewer</h2>
          </div>
          <button className="close-btn" onClick={onClose} type="button">✕</button>
        </div>

        <div className="rag-viewer-toolbar">
          <div className="toolbar-left">
            <select
              value={selectedCollection}
              onChange={(e) => setSelectedCollection(e.target.value)}
              className="collection-select"
            >
              {collections.map((col) => (
                <option key={col.name} value={col.name}>
                  {col.name} ({col.vectors_count} chunks)
                </option>
              ))}
            </select>
            
            <div className="tab-buttons">
              <button
                className={`tab-btn ${activeTab === "browse" ? "active" : ""}`}
                onClick={() => setActiveTab("browse")}
                type="button"
              >
                📋 Browse Chunks
              </button>
              <button
                className={`tab-btn ${activeTab === "search" ? "active" : ""}`}
                onClick={() => setActiveTab("search")}
                type="button"
              >
                🔍 Similarity Search
              </button>
            </div>
          </div>
          
          {embeddingInfo && (
            <div className="embedding-info-badge">
              <span className="info-label">Embedding:</span>
              <span className="info-value">{embeddingInfo.model}</span>
              <span className="info-divider">|</span>
              <span className="info-label">Dimensions:</span>
              <span className="info-value">{embeddingInfo.vector_size}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="rag-viewer-error">
            <span>⚠️</span> {error}
          </div>
        )}

        <div className="rag-viewer-content">
          {activeTab === "browse" && (
            <div className="browse-section">
              <div className="section-header">
                <h3>Stored Chunks</h3>
                <span className="chunk-count">{totalChunks} total chunks</span>
              </div>
              
              {isLoading ? (
                <div className="loading-state">Loading chunks...</div>
              ) : chunks.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">📭</span>
                  <p>No chunks in this collection yet.</p>
                  <p className="empty-hint">Chunks are created when you use RAG features in Research Lab or Project Manager.</p>
                </div>
              ) : (
                <div className="chunks-list">
                  {chunks.map((chunk) => (
                    <div
                      key={chunk.id}
                      className={`chunk-card ${expandedChunk === chunk.id ? "expanded" : ""}`}
                    >
                      <div
                        className="chunk-header"
                        onClick={() => setExpandedChunk(expandedChunk === chunk.id ? null : chunk.id)}
                      >
                        <div className="chunk-meta">
                          <span className="chunk-id">#{chunk.id.slice(0, 8)}</span>
                          <span className="chunk-stats">
                            {chunk.word_count} words · {chunk.char_count} chars
                          </span>
                        </div>
                        <span className="expand-icon">{expandedChunk === chunk.id ? "▼" : "▶"}</span>
                      </div>
                      
                      <div className="chunk-preview">
                        {expandedChunk === chunk.id ? chunk.content : chunk.content_preview}
                      </div>
                      
                      {expandedChunk === chunk.id && Object.keys(chunk.metadata).length > 0 && (
                        <div className="chunk-metadata">
                          <h4>Metadata</h4>
                          <pre>{JSON.stringify(chunk.metadata, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "search" && (
            <div className="search-section">
              <div className="search-input-row">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter a query to find similar chunks..."
                  className="search-input"
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <button
                  className="search-btn"
                  onClick={handleSearch}
                  disabled={isSearching || !searchQuery.trim()}
                  type="button"
                >
                  {isSearching ? "Searching..." : "Search"}
                </button>
              </div>

              {searchResults && (
                <div className="search-results">
                  <div className="results-header">
                    <h3>Results for: "{searchResults.query_preview}"</h3>
                    <span className="results-count">{searchResults.total_results} matches found</span>
                  </div>

                  <div className="similarity-explanation">
                    <h4>📊 Understanding Similarity Scores</h4>
                    <p>
                      Scores use <strong>cosine similarity</strong> (0-1). Higher scores mean the chunk's 
                      meaning is more similar to your query. The {searchResults.embedding_info.vector_size}-dimensional 
                      embedding vectors capture semantic meaning, not just keyword matches.
                    </p>
                    <div className="score-legend">
                      <span className="legend-item"><span className="dot" style={{ background: "#10b981" }} /> 85%+ Excellent</span>
                      <span className="legend-item"><span className="dot" style={{ background: "#3b82f6" }} /> 70-84% Good</span>
                      <span className="legend-item"><span className="dot" style={{ background: "#f59e0b" }} /> 50-69% Moderate</span>
                      <span className="legend-item"><span className="dot" style={{ background: "#ef4444" }} /> &lt;50% Weak</span>
                    </div>
                  </div>

                  <div className="results-list">
                    {searchResults.results.map((result, idx) => (
                      <div key={result.id} className="result-card">
                        <div className="result-header">
                          <span className="result-rank">#{idx + 1}</span>
                          <div className="score-display">
                            <div
                              className="score-bar"
                              style={{
                                width: `${result.score_percent}%`,
                                background: getScoreColor(result.score),
                              }}
                            />
                            <span className="score-value" style={{ color: getScoreColor(result.score) }}>
                              {result.score_percent}%
                            </span>
                          </div>
                        </div>
                        
                        <div className="result-explanation">
                          {result.score_explanation}
                        </div>
                        
                        <div
                          className="result-content"
                          onClick={() => setExpandedChunk(expandedChunk === result.id ? null : result.id)}
                        >
                          {expandedChunk === result.id ? result.content : result.content_preview}
                          {result.content.length > 200 && (
                            <span className="expand-hint">
                              {expandedChunk === result.id ? " (click to collapse)" : " (click to expand)"}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!searchResults && !isSearching && (
                <div className="search-empty-state">
                  <span className="empty-icon">🔍</span>
                  <p>Enter a query to search for semantically similar chunks</p>
                  <p className="empty-hint">
                    The search uses vector embeddings to find content with similar meaning,
                    even if the exact words are different.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
