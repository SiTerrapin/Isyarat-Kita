import { useFocusEffect } from "expo-router";
import {
  Edit3,
  Pin,
  Plus,
  Square,
  Trash2,
  Volume2,
  WifiOff,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useTTS } from "@/hooks/useTTS";
import { CardCategory, QuickCard } from "@/services/api";

const CATEGORIES: { key: "semua" | CardCategory; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "darurat", label: "Darurat" },
  { key: "kesehatan", label: "Kesehatan" },
  { key: "transportasi", label: "Transportasi" },
  { key: "transaksi", label: "Transaksi" },
  { key: "umum", label: "Umum" },
];

const CATEGORY_BADGE: Record<
  CardCategory,
  { bg: string; text: string; label: string }
> = {
  darurat: { bg: "bg-rose-100", text: "text-rose-700", label: "Darurat" },
  kesehatan: { bg: "bg-sky-100", text: "text-sky-700", label: "Kesehatan" },
  transportasi: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    label: "Transportasi",
  },
  transaksi: {
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    label: "Transaksi",
  },
  umum: { bg: "bg-teal-100", text: "text-teal-700", label: "Umum" },
};

export default function QuickCardsScreen() {
  const {
    cards,
    isOfflineCards,
    requireAuth,
    refreshCards,
    addCustomCard,
    editCustomCard,
    removeCustomCard,
  } = useApp();

  const {
    speak,
    stop: stopTTS,
    isLoading: ttsLoading,
    isSpeaking: ttsSpeaking,
    activeVoiceLabel,
  } = useTTS();

  // Hentikan suara bersih saat user berpindah tab
  useFocusEffect(
    useCallback(() => {
      return () => {
        stopTTS();
      };
    }, [stopTTS])
  );

  const [selectedCategory, setSelectedCategory] = useState<
    "semua" | CardCategory
  >("semua");
  const [refreshing, setRefreshing] = useState(false);

  // Fullscreen Communication Modal
  const [activeCard, setActiveCard] = useState<QuickCard | null>(null);

  // Form Tambah / Edit Kartu Kustom
  const [formVisible, setFormVisible] = useState(false);
  const [editingCard, setEditingCard] = useState<QuickCard | null>(null);
  const [formCategory, setFormCategory] = useState<CardCategory>("umum");
  const [formTitle, setFormTitle] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formPinned, setFormPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  const filteredCards = useMemo(() => {
    if (selectedCategory === "semua") return cards;
    return cards.filter((c) => c.category === selectedCategory);
  }, [cards, selectedCategory]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshCards();
    setRefreshing(false);
  };

  const speakCard = (text: string) => {
    if (ttsSpeaking || ttsLoading) {
      stopTTS();
      return;
    }
    speak(text, { speakerRole: "user" });
  };

  const openCreateForm = () => {
    requireAuth("Masuk untuk membuat kartu komunikasi kustom Anda sendiri.", () => {
      setEditingCard(null);
      setFormCategory("umum");
      setFormTitle("");
      setFormMessage("");
      setFormPinned(false);
      setFormVisible(true);
    });
  };

  const openEditForm = (card: QuickCard) => {
    requireAuth("Masuk untuk mengedit kartu kustom Anda.", () => {
      setEditingCard(card);
      setFormCategory(card.category);
      setFormTitle(card.title);
      setFormMessage(card.message);
      setFormPinned(card.is_pinned);
      setFormVisible(true);
    });
  };

  const handleDeleteCard = (card: QuickCard) => {
    Alert.alert("Hapus Kartu", `Hapus kartu "${card.title}"?`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: async () => {
          try {
            await removeCustomCard(card.id);
          } catch (err: any) {
            Alert.alert("Gagal Menghapus", err?.message || "Coba lagi nanti.");
          }
        },
      },
    ]);
  };

  const handleSaveForm = async () => {
    if (!formTitle.trim() || !formMessage.trim()) {
      Alert.alert("Data Belum Lengkap", "Judul dan isi pesan wajib diisi.");
      return;
    }

    setSaving(true);
    try {
      if (editingCard) {
        await editCustomCard(editingCard.id, {
          category: formCategory,
          title: formTitle.trim(),
          message: formMessage.trim(),
          is_pinned: formPinned,
        });
      } else {
        await addCustomCard({
          category: formCategory,
          title: formTitle.trim(),
          message: formMessage.trim(),
          is_pinned: formPinned,
        });
      }
      setFormVisible(false);
    } catch (err: any) {
      Alert.alert("Gagal Menyimpan", err?.message || "Periksa koneksi server.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={["top"]}>
      {/* Header + Filter Chips */}
      <View className="border-b border-slate-200 bg-white pb-3 pt-4 dark:border-slate-800 dark:bg-slate-900">
        <View className="px-5">
          <Text className="text-2xl font-extrabold text-slate-900 dark:text-white">
            Kartu Komunikasi Cepat
          </Text>
          <Text className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            Ketuk kartu untuk menampilkan teks super besar & bacakan suara.
          </Text>
        </View>

        {isOfflineCards && (
          <View className="mx-5 mt-3 flex-row items-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950">
            <WifiOff size={15} color="#B45309" />
            <Text className="ml-2 flex-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
              Mode Offline: Menampilkan 5 kartu darurat bawaan.
            </Text>
          </View>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, gap: 8 }}
        >
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat.key;
            return (
              <Pressable
                key={cat.key}
                onPress={() => setSelectedCategory(cat.key)}
                className={`rounded-full border px-4 py-2 ${
                  active
                    ? "border-teal-600 bg-teal-600"
                    : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                }`}
              >
                <Text
                  className={`text-sm font-bold ${
                    active ? "text-white" : "text-slate-700 dark:text-slate-200"
                  }`}
                >
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Daftar Kartu */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0D9488"
          />
        }
      >
        <View className="gap-3.5">
          {filteredCards.map((card) => {
            const badge = CATEGORY_BADGE[card.category] || CATEGORY_BADGE.umum;
            return (
              <Pressable
                key={card.id}
                onPress={() => setActiveCard(card)}
                className="rounded-3xl border border-slate-200 bg-white p-5 active:bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
              >
                <View className="mb-2 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <View className={`rounded-full px-3 py-1 ${badge.bg}`}>
                      <Text className={`text-xs font-extrabold ${badge.text}`}>
                        {badge.label}
                      </Text>
                    </View>
                    {card.is_pinned && (
                      <View className="flex-row items-center rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
                        <Pin size={12} color="#0D9488" />
                        <Text className="ml-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                          Sematkan
                        </Text>
                      </View>
                    )}
                    {card.is_custom && (
                      <View className="rounded-full bg-teal-50 px-2.5 py-1 dark:bg-teal-950">
                        <Text className="text-xs font-bold text-teal-700 dark:text-teal-300">
                          Kustom
                        </Text>
                      </View>
                    )}
                  </View>

                  {card.is_custom && (
                    <View className="flex-row items-center gap-1.5">
                      <Pressable
                        onPress={() => openEditForm(card)}
                        className="h-9 w-9 items-center justify-center rounded-xl bg-slate-100 active:bg-slate-200 dark:bg-slate-800"
                        accessibilityLabel="Edit kartu"
                      >
                        <Edit3 size={16} color="#64748B" />
                      </Pressable>
                      <Pressable
                        onPress={() => handleDeleteCard(card)}
                        className="h-9 w-9 items-center justify-center rounded-xl bg-rose-50 active:bg-rose-100 dark:bg-rose-950"
                        accessibilityLabel="Hapus kartu"
                      >
                        <Trash2 size={16} color="#E11D48" />
                      </Pressable>
                    </View>
                  )}
                </View>

                <Text className="text-xl font-extrabold text-slate-900 dark:text-white">
                  {card.title}
                </Text>
                <Text
                  className="mt-1.5 text-base leading-relaxed text-slate-600 dark:text-slate-300"
                  numberOfLines={3}
                >
                  {card.message}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Floating Action Button (+ Tambah Kartu) */}
      <Pressable
        onPress={openCreateForm}
        className="absolute bottom-6 right-5 flex-row items-center rounded-full bg-teal-600 px-5 py-4 shadow-lg active:bg-teal-700"
        accessibilityLabel="Tambah Kartu Kustom"
      >
        <Plus size={22} color="#FFFFFF" />
        <Text className="ml-2 text-base font-extrabold text-white">
          Tambah Kartu
        </Text>
      </Pressable>

      {/* Fullscreen Communication Modal */}
      <Modal
        visible={Boolean(activeCard)}
        animationType="fade"
        onRequestClose={() => {
          stopTTS();
          setActiveCard(null);
        }}
      >
        {activeCard && (
          <SafeAreaView
            className={`flex-1 justify-between p-6 ${
              activeCard.category === "darurat"
                ? "bg-rose-600"
                : "bg-slate-950"
            }`}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <View className="rounded-full bg-white/20 px-4 py-1.5">
                  <Text className="text-sm font-extrabold uppercase tracking-wider text-white">
                    {activeCard.title}
                  </Text>
                </View>
                <View className="rounded-full bg-white/15 px-3 py-1.5">
                  <Text className="text-xs font-bold text-white/90">
                    Suara: {activeVoiceLabel}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => {
                  stopTTS();
                  setActiveCard(null);
                }}
                className="h-12 w-12 items-center justify-center rounded-full bg-white/20"
                accessibilityLabel="Tutup layar penuh"
              >
                <X size={26} color="#FFFFFF" />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: "center",
                paddingVertical: 24,
              }}
            >
              <Text className="text-center text-4xl font-black leading-tight text-white">
                {activeCard.message}
              </Text>
            </ScrollView>

            <View className="gap-3">
              <Pressable
                onPress={() => speakCard(activeCard.message)}
                className={`flex-row items-center justify-center rounded-2xl py-5 ${
                  ttsSpeaking
                    ? "bg-amber-400 active:bg-amber-500"
                    : "bg-white active:bg-slate-100"
                }`}
              >
                {ttsLoading ? (
                  <ActivityIndicator color="#0F172A" size="small" />
                ) : ttsSpeaking ? (
                  <Square size={22} color="#0F172A" fill="#0F172A" />
                ) : (
                  <Volume2 size={26} color="#0F172A" />
                )}
                <Text className="ml-3 text-xl font-extrabold text-slate-950">
                  {ttsLoading
                    ? "Memuat suara..."
                    : ttsSpeaking
                    ? "Hentikan Suara"
                    : `Bacakan Suara (${activeVoiceLabel})`}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  stopTTS();
                  setActiveCard(null);
                }}
                className="items-center rounded-2xl border border-white/40 py-4 active:bg-white/10"
              >
                <Text className="text-base font-bold text-white">Tutup</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        )}
      </Modal>

      {/* Modal Form Tambah / Edit Kartu Kustom */}
      <Modal
        visible={formVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setFormVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 justify-end bg-black/50"
        >
          <View className="max-h-[90%] rounded-t-3xl bg-white px-6 pb-8 pt-6">
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-xl font-extrabold text-slate-900">
                {editingCard ? "Edit Kartu Kustom" : "Buat Kartu Kustom"}
              </Text>
              <Pressable
                onPress={() => setFormVisible(false)}
                className="h-10 w-10 items-center justify-center rounded-full bg-slate-100"
              >
                <X size={20} color="#334155" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text className="mb-2 text-sm font-bold text-slate-800">
                Kategori
              </Text>
              <View className="mb-4 flex-row flex-wrap gap-2">
                {(
                  [
                    "darurat",
                    "kesehatan",
                    "transportasi",
                    "transaksi",
                    "umum",
                  ] as CardCategory[]
                ).map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => setFormCategory(cat)}
                    className={`rounded-full border px-3.5 py-2 ${
                      formCategory === cat
                        ? "border-teal-600 bg-teal-600"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold capitalize ${
                        formCategory === cat ? "text-white" : "text-slate-700"
                      }`}
                    >
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text className="mb-1.5 text-sm font-bold text-slate-800">
                Judul Kartu
              </Text>
              <TextInput
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="Contoh: Bayar QRIS"
                placeholderTextColor="#94A3B8"
                className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-base text-slate-900"
              />

              <Text className="mb-1.5 text-sm font-bold text-slate-800">
                Isi Pesan (Ditampilkan Besar & Dibacakan)
              </Text>
              <TextInput
                value={formMessage}
                onChangeText={setFormMessage}
                placeholder="Contoh: Permisi, apakah saya bisa membayar pakai QRIS?"
                placeholderTextColor="#94A3B8"
                multiline
                className="mb-4 min-h-[100px] rounded-2xl border border-slate-200 bg-slate-50 p-4 text-base text-slate-900"
                textAlignVertical="top"
              />

              <Pressable
                onPress={() => setFormPinned((prev) => !prev)}
                className="mb-5 flex-row items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5"
              >
                <View className="flex-row items-center">
                  <Pin size={18} color={formPinned ? "#0D9488" : "#64748B"} />
                  <Text className="ml-2 text-sm font-bold text-slate-800">
                    Sematkan di Paling Atas
                  </Text>
                </View>
                <Text
                  className={`text-xs font-extrabold ${
                    formPinned ? "text-teal-600" : "text-slate-400"
                  }`}
                >
                  {formPinned ? "AKTIF" : "TIDAK"}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleSaveForm}
                disabled={saving}
                className="items-center justify-center rounded-2xl bg-teal-600 py-4 active:bg-teal-700"
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-base font-extrabold text-white">
                    {editingCard ? "Simpan Perubahan" : "Simpan Kartu"}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
