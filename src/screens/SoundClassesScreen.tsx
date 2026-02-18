import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Button, Card, Divider, HelperText, List, Text, TextInput } from 'react-native-paper'
import { useNavigation } from '@react-navigation/native'

import { useAppSelector } from '../store/hooks'
import {
  createSoundClass,
  fetchSoundClassesPage,
  type SoundClassItem,
  type SoundClassesPagination,
} from '../services/soundClassesApi'

function n(v?: number | null) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export function SoundClassesScreen() {
  const navigation = useNavigation<any>()
  const apiBaseUrl = useAppSelector((s) => s.settings.apiBaseUrl)
  const auth = useAppSelector((s) => s.auth)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [newClassName, setNewClassName] = useState('')

  const [items, setItems] = useState<SoundClassItem[]>([])
  const [pagination, setPagination] = useState<SoundClassesPagination | null>(null)

  const load = useCallback(
    async (opts: { page?: number; append?: boolean } = {}) => {
      setLoading(true)
      setError(null)
      setInfo(null)
      try {
        const page = opts.page ?? 1
        const res = await fetchSoundClassesPage(apiBaseUrl, {
          page,
          perPage: 50,
          search: search.trim() || undefined,
          sortBy: 'created_at',
          sortOrder: 'desc',
        })
        setPagination(res.pagination)
        setItems((prev) => (opts.append ? [...prev, ...res.items] : res.items))
      } catch (e: any) {
        if (!opts.append) setItems([])
        setPagination(null)
        setError(String(e?.message || 'Failed to load sound classes'))
      } finally {
        setLoading(false)
      }
    },
    [apiBaseUrl, search],
  )

  useEffect(() => {
    void load({ page: 1, append: false })
  }, [])

  const canLoadMore = Boolean(pagination?.has_next)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((c) => (c.display_name || c.name || '').toLowerCase().includes(q))
  }, [items, search])

  const create = useCallback(async () => {
    const name = newClassName.trim()
    if (!name) return
    if (!auth.isAuthenticated) {
      setError('Please sign in to create a class')
      return
    }
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      const created = await createSoundClass(apiBaseUrl, name)
      setItems((prev) => [created, ...prev])
      setNewClassName('')
      setInfo(`Created class: ${created.display_name || created.name}`)
    } catch (e: any) {
      setError(String(e?.message || 'Failed to create class'))
    } finally {
      setLoading(false)
    }
  }, [apiBaseUrl, auth.isAuthenticated, newClassName])

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <Card.Title title="Sound Classes" subtitle="Manage your categories" />
        <Card.Content style={{ gap: 10 }}>
          <TextInput
            label="Search"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button mode="outlined" loading={loading} disabled={loading} onPress={() => load({ page: 1, append: false })}>
            Refresh
          </Button>
          <HelperText type={error ? 'error' : 'info'} visible>
            {error || info || `Loaded: ${items.length}`}
          </HelperText>
        </Card.Content>
      </Card>

      <Card>
        <Card.Title title="Create new class" subtitle="Adds a new word/category" />
        <Card.Content style={{ gap: 10 }}>
          <TextInput
            label="Class name (word)"
            value={newClassName}
            onChangeText={setNewClassName}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button mode="contained" disabled={!newClassName.trim()} loading={loading} onPress={create}>
            Create
          </Button>
        </Card.Content>
      </Card>

      <Card>
        <Card.Title title="Classes list" subtitle={`${filtered.length} shown`} />
        <Card.Content style={{ gap: 10 }}>
          {filtered.length === 0 ? (
            <Text variant="bodySmall" style={{ opacity: 0.75 }}>
              No classes found.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {filtered.map((c) => (
                <Card key={c.id}>
                  <Card.Content style={{ gap: 6 }}>
                    <Text variant="titleMedium">{c.display_name || c.name}</Text>
                    <Text variant="bodySmall" style={{ opacity: 0.75 }}>
                      Gold: {n(c.gold_recordings)} · Pending: {n(c.pending_recordings)} · Raw: {n(c.raw_recordings)} · Aug: {n(c.augmented_recordings)} · Avail: {n(c.training_recordings)}
                    </Text>
                    <Divider />
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      <Button mode="contained" onPress={() => navigation.navigate('Record', { classId: c.id })}>
                        Record
                      </Button>
                      <Button mode="outlined" onPress={() => navigation.navigate('Verify', { classId: c.id })}>
                        Verify
                      </Button>
                      <Button mode="text" onPress={() => setInfo(`Class ID: ${c.id}`)}>
                        Details
                      </Button>
                    </View>
                  </Card.Content>
                </Card>
              ))}
            </View>
          )}

          {canLoadMore ? (
            <Button
              mode="outlined"
              loading={loading}
              disabled={loading}
              onPress={() => load({ page: (pagination?.page || 1) + 1, append: true })}
            >
              Load more
            </Button>
          ) : null}
        </Card.Content>
      </Card>
    </ScrollView>
  )
}

