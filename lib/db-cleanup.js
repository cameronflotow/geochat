import { db } from './firebase';
import { collection, getDocs, deleteDoc, doc, writeBatch, query, where } from 'firebase/firestore';

/**
 * Completely wipes a chat and all associated data (posts, comments, presence)
 * to ensure no orphaned data remains.
 */
/**
 * Deletes a single post and all its comments.
 */
export async function deletePostFully(chatId, postId) {
    if (!chatId || !postId) return;

    // Delete comments
    const commentsRef = collection(db, "chats", chatId, "posts", postId, "comments");
    const commentsSnap = await getDocs(commentsRef);
    await Promise.all(commentsSnap.docs.map(c => deleteDoc(c.ref)));

    // Delete post
    await deleteDoc(doc(db, "chats", chatId, "posts", postId));
}

export async function deleteChatFully(chatId) {
    if (!chatId) return;

    console.log(`Starting deep clean for chat ${chatId}...`);

    // 1. Clean Posts (Best Effort)
    try {
        const postsRef = collection(db, "chats", chatId, "posts");
        const postsSnap = await getDocs(postsRef);

        // Delete each post individually, catching errors so one failure doesn't stop the rest
        await Promise.allSettled(
            postsSnap.docs.map(postSnap =>
                deletePostFully(chatId, postSnap.id).catch(e => console.error(`Failed to delete post ${postSnap.id}`, e))
            )
        );
    } catch (e) {
        console.error("Error cleaning posts:", e);
    }

    // 2. Clean Presence (Best Effort)
    try {
        const presenceRef = collection(db, "chats", chatId, "presence");
        const presenceSnap = await getDocs(presenceRef);
        await Promise.allSettled(
            presenceSnap.docs.map(p => deleteDoc(p.ref).catch(e => console.error("Presence del fail", e)))
        );
    } catch (e) {
        console.error("Error cleaning presence:", e);
    }

    // 3. DELETE THE CHAT (CRITICAL)
    try {
        await deleteDoc(doc(db, "chats", chatId));
        console.log(`Chat document ${chatId} deleted successfully.`);
    } catch (error) {
        console.error("CRITICAL: Error deleting chat document:", error);
        // If this fails, the chat won't disappear, so we might want to rethrow or handle explicitly
        throw error;
    }

    // 4. Clean Linked Conversations (Best Effort, Post-Delete)
    try {
        const conversationsQuery = query(
            collection(db, "conversations"),
            where("chatId", "==", chatId)
        );
        const conversationsSnap = await getDocs(conversationsQuery);
        await Promise.allSettled(
            conversationsSnap.docs.map(c => deleteDoc(c.ref).catch(e => console.error("Conv del fail", e)))
        );
    } catch (e) {
        console.error("Error cleaning conversations:", e);
    }

    console.log(`Deep clean routines finished for ${chatId}`);
}
