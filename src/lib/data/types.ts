import type { Collab, CollabInput, Post, PostInput } from "../domain";

/** Storage interface. Supabase in production, in-memory in demo mode. */
export interface Repo {
  listCollabs(): Promise<Collab[]>;
  getCollab(id: string): Promise<Collab | null>;
  createCollab(input: CollabInput): Promise<Collab>;
  updateCollab(id: string, patch: Partial<CollabInput>): Promise<void>;
  deleteCollab(id: string): Promise<void>;

  listPosts(): Promise<Post[]>;
  getPost(id: string): Promise<Post | null>;
  createPost(input: PostInput): Promise<Post>;
  updatePost(id: string, patch: Partial<PostInput>): Promise<void>;
  deletePost(id: string): Promise<void>;
}
