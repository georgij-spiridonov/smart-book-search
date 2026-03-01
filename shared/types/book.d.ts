export interface BookJob {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: {
    currentPage: number;
    totalPages: number;
    chunksProcessed: number;
    totalChunks: number;
  };
}

export interface Book {
  id: string;
  userId: string;
  title: string;
  author: string;
  coverUrl: string;
  blobUrl: string;
  filename: string;
  fileSize: number;
  uploadedAt: string;
  vectorized: boolean;
  job: BookJob | null;
}
