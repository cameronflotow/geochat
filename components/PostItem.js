'use client';

import { useState, useEffect } from 'react';
import { Heart, MessageCircle, Trash2, Send } from 'lucide-react';
import { doc, updateDoc, arrayUnion, arrayRemove, collection, addDoc, onSnapshot, serverTimestamp, query, orderBy, deleteDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

export default function PostItem({ post, chatId, currentUserId, isOwner }) {
    const [comments, setComments] = useState([]);
    const [showComments, setShowComments] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [liked, setLiked] = useState(post.likes?.includes(currentUserId));

    // Listen to comments if expanded
    useEffect(() => {
        if (!showComments) return;
        const q = query(collection(db, "chats", chatId, "posts", post.id, "comments"), orderBy("createdAt", "asc"));
        const unsub = onSnapshot(q, (snap) => {
            setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, [showComments, chatId, post.id]);

    const handleLike = async () => {
        const ref = doc(db, "chats", chatId, "posts", post.id);
        if (liked) {
            await updateDoc(ref, { likes: arrayRemove(currentUserId) });
            setLiked(false);
        } else {
            await updateDoc(ref, { likes: arrayUnion(currentUserId) });
            setLiked(true);
            // Notify owner
            if (post.creatorId !== currentUserId) {
                addDoc(collection(db, "users", post.creatorId, "notifications"), {
                    type: 'like',
                    chatId,
                    postId: post.id,
                    senderName: auth.currentUser?.displayName || 'Someone',
                    createdAt: serverTimestamp(),
                    read: false
                });
            }
        }
    };

    const handlePostComment = async () => {
        if (!commentText.trim()) return;
        await addDoc(collection(db, "chats", chatId, "posts", post.id, "comments"), {
            text: commentText,
            creatorId: currentUserId,
            creatorName: auth.currentUser?.displayName || 'Anonymous',
            creatorPhoto: auth.currentUser?.photoURL || null,
            createdAt: serverTimestamp()
        });
        // Notify owner
        if (post.creatorId !== currentUserId) {
            addDoc(collection(db, "users", post.creatorId, "notifications"), {
                type: 'comment',
                chatId,
                postId: post.id,
                senderName: auth.currentUser?.displayName || 'Someone',
                createdAt: serverTimestamp(),
                read: false
            });
        }
        setCommentText('');
    };

    const [deletingId, setDeletingId] = useState(null); // 'post' or commentId

    const handleDeleteComment = async (commentId) => {
        if (deletingId === commentId) {
            // Confirmed
            await deleteDoc(doc(db, "chats", chatId, "posts", post.id, "comments", commentId));
            setDeletingId(null);
        } else {
            // First click
            setDeletingId(commentId);
            setTimeout(() => setDeletingId(null), 3000); // Reset after 3s
        }
    };

    const handleDeletePost = async () => {
        if (deletingId === 'post') {
            await deleteDoc(doc(db, "chats", chatId, "posts", post.id));
        } else {
            setDeletingId('post');
            setTimeout(() => setDeletingId(null), 3000);
        }
    };

    const isMine = post.creatorId === currentUserId;
    // Strict requirement: "only the user that posts these things can delete them"
    // Previously allowed chat owner (isOwner) to delete, now restricting to author (isMine).
    const canDeletePost = isMine;

    return (
        <div className="glass-panel p-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden shrink-0 border border-purple-500/30">
                    {post.creatorPhoto ? (
                        <img src={post.creatorPhoto} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs">?</div>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                        <span className="font-bold text-sm text-purple-300">{post.creatorName}</span>
                        {canDeletePost && (
                            <button
                                onClick={handleDeletePost}
                                className={`transition-colors ${deletingId === 'post' ? 'text-red-500 font-bold text-xs animate-pulse' : 'text-gray-500 hover:text-red-500'}`}
                            >
                                {deletingId === 'post' ? 'Confirm?' : <Trash2 className="w-4 h-4" />}
                            </button>
                        )}
                    </div>
                    <p className="text-gray-200 mt-1 break-words">{post.text}</p>

                    {/* Actions */}
                    <div className="flex items-center gap-4 mt-3">
                        <button
                            onClick={handleLike}
                            className={`flex items-center gap-1 transition-colors text-sm ${liked ? 'text-pink-500' : 'text-gray-400 hover:text-pink-500'}`}
                        >
                            <Heart className="w-4 h-4" fill={liked ? "currentColor" : "none"} />
                            <span>{post.likes?.length || 0}</span>
                        </button>
                        <button
                            onClick={() => setShowComments(!showComments)}
                            className={`flex items-center gap-1 transition-colors text-sm ${showComments ? 'text-blue-400' : 'text-gray-400 hover:text-blue-400'}`}
                        >
                            <MessageCircle className="w-4 h-4" />
                            <span>{comments.length > 0 ? comments.length : 'Comment'}</span>
                        </button>
                    </div>

                    {/* Comments Section */}
                    {showComments && (
                        <div className="mt-4 space-y-3 border-l-2 border-white/10 pl-3">
                            {comments.map(comment => (
                                <div key={comment.id} className="text-sm flex gap-2 items-start">
                                    <div className="w-6 h-6 rounded-full bg-gray-700 overflow-hidden shrink-0 border border-white/10 mt-0.5">
                                        {comment.creatorPhoto ? (
                                            <img src={comment.creatorPhoto} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="flex items-center justify-center h-full w-full text-[10px] text-gray-400 cursor-default">?</div>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between">
                                            <span className="font-bold text-purple-200 text-xs">{comment.creatorName}</span>
                                            {(comment.creatorId === currentUserId) && (
                                                <button
                                                    onClick={() => handleDeleteComment(comment.id)}
                                                    className={`transition-colors ${deletingId === comment.id ? 'text-red-500 font-bold text-xs' : 'text-gray-500 hover:text-red-500'}`}
                                                >
                                                    {deletingId === comment.id ? 'Delete?' : <Trash2 className="w-3 h-3" />}
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-gray-300">{comment.text}</p>
                                    </div>
                                </div>
                            ))}

                            <div className="flex items-center gap-2 mt-2">
                                <input
                                    type="text"
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    placeholder="Reply..."
                                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-sm text-white focus:outline-none"
                                    onKeyDown={e => e.key === 'Enter' && handlePostComment()}
                                />
                                <button onClick={handlePostComment} className="text-blue-400 hover:text-white">
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
